using System.IO;
using System.Text.Json;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Autodesk.Revit.UI;
using Microsoft.Win32;

namespace FutolStructure.Revit2027;

[Transaction(TransactionMode.Manual)]
public sealed class FutolStructureCommand : IExternalCommand
{
    private const double CoordinateToleranceFeet = 1e-5;

    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var pendingJobPath = RevitAutomationPaths.PendingJobPath;
        if (File.Exists(pendingJobPath) &&
            FutolStructureStartup.TryReadJob(pendingJobPath, out var queuedManifestPath,
                out var queuedHostPath, out var queuedJobId, out _))
        {
            var queuedDocument = commandData.Application.ActiveUIDocument?.Document;
            if (queuedDocument is null)
            {
                message = "The queued Revit import has no active host project.";
                FutolStructureStartup.CompleteJob(pendingJobPath, "failed", queuedJobId, message);
                return Result.Failed;
            }
            if (!FutolStructureStartup.PathsEqual(queuedDocument.PathName, queuedHostPath))
            {
                message = $"The queued Revit import host is not active. Expected:\n{queuedHostPath}";
                FutolStructureStartup.CompleteJob(pendingJobPath, "failed", queuedJobId, message);
                return Result.Failed;
            }
            if (!File.Exists(queuedManifestPath))
            {
                message = $"The queued FutolStructure manifest was not found:\n\n{queuedManifestPath}";
                FutolStructureStartup.CompleteJob(pendingJobPath, "failed", queuedJobId, message);
                return Result.Failed;
            }
            if (!TryImportManifest(queuedDocument, commandData.Application.Application.VersionNumber,
                queuedManifestPath, out message, showDialog: true))
            {
                FutolStructureStartup.CompleteJob(pendingJobPath, "failed", queuedJobId, message);
                return Result.Failed;
            }
            TryActivateWorkspace(commandData.Application, queuedDocument);
            queuedDocument.Save();
            FutolStructureStartup.CompleteJob(pendingJobPath, "completed", queuedJobId,
                "Manifest imported and host project saved.");
            return Result.Succeeded;
        }

        var dialog = new OpenFileDialog
        {
            Title = "Open FutolStructure Revit import manifest",
            Filter = "FutolStructure Revit manifest (*.json)|*.json|All files (*.*)|*.*",
            CheckFileExists = true,
            Multiselect = false
        };
        if (dialog.ShowDialog() != true) return Result.Cancelled;

        var activeDocument = commandData.Application.ActiveUIDocument?.Document;
        if (activeDocument is null)
        {
            message = "Open a Revit project before importing FutolStructure data.";
            return Result.Failed;
        }

        if (!TryImportManifest(activeDocument, commandData.Application.Application.VersionNumber,
                dialog.FileName, out message, showDialog: true))
            return Result.Failed;

        TryActivateWorkspace(commandData.Application, activeDocument);
        return Result.Succeeded;
    }

    internal static bool TryImportManifest(Document document, string revitVersion, string manifestPath,
        out string message, bool showDialog)
    {
        message = string.Empty;

        JsonDocument manifestDocument;
        try
        {
            manifestDocument = JsonDocument.Parse(File.ReadAllText(manifestPath));
        }
        catch (Exception ex)
        {
            message = $"Manifest JSON could not be read: {ex.Message}";
            return false;
        }

        using (manifestDocument)
        {
            var root = manifestDocument.RootElement;
            var contract = ReadString(root, "contract");
            if (contract != "FutolStructure.RevitNativeImport.v1")
            {
                message = "Unsupported FutolStructure Revit import contract.";
                return false;
            }
            if (!root.TryGetProperty("source", out var source) ||
                !source.TryGetProperty("levels", out var levels) ||
                levels.ValueKind != JsonValueKind.Array)
            {
                message = "The manifest has no governed source levels.";
                return false;
            }

            var audit = new ImportAudit
            {
                Contract = contract,
                ManifestPath = manifestPath,
                RevitVersion = revitVersion,
                StartedAt = DateTimeOffset.UtcNow
            };
            if (root.TryGetProperty("model", out var modelForMetadata) &&
                modelForMetadata.TryGetProperty("provenance", out var provenance))
                audit.Provenance = ImportProvenance.FromJson(provenance);
            try
            {
                using var transaction = new Transaction(document, "FutolStructure governed concrete model");
                transaction.Start();
                ImportLevels(document, levels, audit);
                if (source.TryGetProperty("gridDefinition", out var gridDefinition))
                    ImportGrids(document, gridDefinition, audit);
                if (root.TryGetProperty("model", out var model))
                {
                    if (model.TryGetProperty("columns", out var columns))
                        ImportColumns(document, columns, audit);
                    ImportConcreteMembers(document, model, audit);
                }
                audit.WorkspaceView = ConfigureWorkspace(document, levels, audit);
                transaction.Commit();
            }
            catch (Exception ex)
            {
                audit.Errors.Add(ex.Message);
                audit.CompletedAt = DateTimeOffset.UtcNow;
                WriteAudit(manifestPath, audit);
                message = $"FutolStructure import failed: {ex.Message}";
                return false;
            }

            audit.RebarStatus = root.TryGetProperty("rebar", out var rebar)
                ? ReadString(rebar, "status") ?? "PENDING_APPROVED_DESIGN_RESULTS"
                : "PENDING_APPROVED_DESIGN_RESULTS";
            audit.CompletedAt = DateTimeOffset.UtcNow;
            var auditPath = WriteAudit(manifestPath, audit);
            if (showDialog)
                ShowImportSummary(contract, audit, auditPath);
            return true;
        }
    }

    private static void ShowImportSummary(string contract, ImportAudit audit, string auditPath)
    {
        TaskDialog.Show(
            "FutolStructure Revit Import",
            $"Manifest validated: {contract}\n\n" +
            $"Levels created / matched / blocked: {audit.LevelsCreated} / {audit.LevelsMatched} / {audit.LevelsBlocked}\n" +
            $"Grids created / matched / blocked: {audit.GridsCreated} / {audit.GridsMatched} / {audit.GridsBlocked}\n" +
            $"Columns created / matched / blocked: {audit.ColumnsCreated} / {audit.ColumnsMatched} / {audit.ColumnsBlocked}\n" +
            $"Column geometry native / governed proxy: {audit.ColumnsNative} / {audit.ColumnsProxy}\n" +
            $"Beams created / matched / blocked: {audit.BeamsCreated} / {audit.BeamsMatched} / {audit.BeamsBlocked}\n" +
            $"Slabs created / matched / blocked: {audit.SlabsCreated} / {audit.SlabsMatched} / {audit.SlabsBlocked}\n" +
            $"Footings created / matched / blocked: {audit.FootingsCreated} / {audit.FootingsMatched} / {audit.FootingsBlocked}\n" +
            $"Pedestals created / matched / blocked: {audit.PedestalsCreated} / {audit.PedestalsMatched} / {audit.PedestalsBlocked}\n" +
            $"Tie beams created / matched / blocked: {audit.TieBeamsCreated} / {audit.TieBeamsMatched} / {audit.TieBeamsBlocked}\n" +
            $"Workspace: {audit.WorkspaceView}\n" +
            $"Rebar handoff: {audit.RebarStatus}\n\nAudit: {auditPath}\n\n" +
            "Columns use native Revit families when compatible types are available, with exact governed proxies as fallback. Concrete beams, slabs, footings, pedestals, and tie beams are imported as exact governed Revit coordination solids. Approved reinforcement remains intentionally deferred.");
    }

    private static void ImportLevels(Document document, JsonElement levels, ImportAudit audit)
    {
        var existing = new FilteredElementCollector(document).OfClass(typeof(Level)).Cast<Level>().ToList();
        foreach (var sourceLevel in levels.EnumerateArray())
        {
            var id = ReadString(sourceLevel, "id") ?? string.Empty;
            var name = ReadString(sourceLevel, "name") ?? id;
            if (string.IsNullOrWhiteSpace(name) || !TryReadDouble(sourceLevel, "elevation", out var elevationMeters))
            {
                audit.LevelsBlocked++;
                audit.Warnings.Add($"Skipped invalid level '{id}'.");
                continue;
            }

            var elevation = ToInternalMeters(elevationMeters);
            var namedLevel = existing.FirstOrDefault(item => string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase));
            if (namedLevel is not null)
            {
                if (Math.Abs(namedLevel.Elevation - elevation) > CoordinateToleranceFeet)
                {
                    audit.LevelsBlocked++;
                    audit.Warnings.Add($"Level '{name}' exists at a different elevation and was not modified.");
                    continue;
                }
                audit.LevelsMatched++;
                SetComments(namedLevel, $"FutolStructure Level ID: {id}");
                continue;
            }

            var level = Level.Create(document, elevation);
            level.Name = name;
            SetComments(level, $"FutolStructure Level ID: {id}");
            existing.Add(level);
            audit.LevelsCreated++;
        }
    }

    private static void ImportGrids(Document document, JsonElement definition, ImportAudit audit)
    {
        var xLines = ReadGridLines(definition, "xLines");
        var yLines = ReadGridLines(definition, "yLines");
        if (xLines.Count == 0 || yLines.Count == 0)
        {
            audit.Warnings.Add("Grid definition is incomplete; no native grids were created.");
            return;
        }

        var margin = Math.Max(1.0, TryReadDouble(definition, "bubbleSizeM", out var bubble) ? bubble : 1.25);
        var minX = xLines.Min(item => item.CoordinateM) - margin;
        var maxX = xLines.Max(item => item.CoordinateM) + margin;
        var minY = yLines.Min(item => item.CoordinateM) - margin;
        var maxY = yLines.Max(item => item.CoordinateM) + margin;
        var existing = new FilteredElementCollector(document).OfClass(typeof(Grid)).Cast<Grid>().ToList();

        foreach (var sourceGrid in xLines)
        {
            var x = ToInternalMeters(sourceGrid.CoordinateM);
            var curve = Line.CreateBound(new XYZ(x, ToInternalMeters(minY), 0), new XYZ(x, ToInternalMeters(maxY), 0));
            CreateOrMatchGrid(document, existing, sourceGrid.Label, curve, true, x, audit);
        }
        foreach (var sourceGrid in yLines)
        {
            var y = ToInternalMeters(sourceGrid.CoordinateM);
            var curve = Line.CreateBound(new XYZ(ToInternalMeters(minX), y, 0), new XYZ(ToInternalMeters(maxX), y, 0));
            CreateOrMatchGrid(document, existing, sourceGrid.Label, curve, false, y, audit);
        }
    }

    private static string ConfigureWorkspace(Document document, JsonElement sourceLevels, ImportAudit audit)
    {
        var governedElements = new FilteredElementCollector(document)
            .WhereElementIsNotElementType()
            .Where(IsGovernedElement)
            .ToList();
        var bounds = GetGovernedBounds(governedElements);
        if (bounds is null)
        {
            audit.Warnings.Add("The governed model has no viewable geometry; workspace views were not created.");
            return string.Empty;
        }

        var workspace = GetOrCreateThreeDView(document, "FS Structural Workspace");
        if (workspace is null)
        {
            audit.Warnings.Add("No Revit 3D view family was available for the FS workspace.");
            return string.Empty;
        }

        workspace.IsSectionBoxActive = true;
        workspace.SetSectionBox(bounds);
        HideDefaultDatums(document, workspace);
        CreateStructuralPlans(document, sourceLevels, bounds, audit);
        return workspace.Name;
    }

    private static View3D? GetOrCreateThreeDView(Document document, string name)
    {
        var existing = new FilteredElementCollector(document)
            .OfClass(typeof(View3D))
            .Cast<View3D>()
            .FirstOrDefault(view => !view.IsTemplate &&
                string.Equals(view.Name, name, StringComparison.OrdinalIgnoreCase));
        if (existing is not null) return existing;

        var type = new FilteredElementCollector(document)
            .OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>()
            .FirstOrDefault(item => item.ViewFamily == ViewFamily.ThreeDimensional);
        return type is null ? null : View3D.CreateIsometric(document, type.Id);
    }

    private static void CreateStructuralPlans(Document document, JsonElement sourceLevels,
        BoundingBoxXYZ bounds, ImportAudit audit)
    {
        var planType = new FilteredElementCollector(document)
            .OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>()
            .FirstOrDefault(item => item.ViewFamily == ViewFamily.FloorPlan);
        if (planType is null)
        {
            audit.Warnings.Add("No Revit floor-plan view family was available for FS structural plans.");
            return;
        }

        var levels = new FilteredElementCollector(document)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .ToList();
        var planViews = new FilteredElementCollector(document)
            .OfClass(typeof(ViewPlan))
            .Cast<ViewPlan>()
            .Where(view => !view.IsTemplate)
            .ToList();
        foreach (var sourceLevel in sourceLevels.EnumerateArray())
        {
            var id = ReadString(sourceLevel, "id") ?? string.Empty;
            var name = ReadString(sourceLevel, "name") ?? id;
            if (string.IsNullOrWhiteSpace(name)) continue;

            var level = levels.FirstOrDefault(item =>
                string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase) &&
                IsGovernedElement(item));
            if (level is null) continue;

            var viewName = $"FS {SanitizeViewName(name)} - Structural Plan";
            var plan = planViews.FirstOrDefault(view =>
                string.Equals(view.Name, viewName, StringComparison.OrdinalIgnoreCase));
            if (plan is null)
            {
                plan = ViewPlan.Create(document, planType.Id, level.Id);
                plan.Name = viewName;
                planViews.Add(plan);
            }

            plan.CropBoxActive = true;
            plan.CropBoxVisible = false;
            plan.CropBox = bounds;
            HideDefaultDatums(document, plan);
            SetComments(plan, $"FutolStructure Workspace Level ID: {id}");
        }
    }

    private static string SanitizeViewName(string name) =>
        name.Replace('/', '-').Replace('\\', '-').Trim();

    private static BoundingBoxXYZ? GetGovernedBounds(IEnumerable<Element> elements)
    {
        BoundingBoxXYZ? bounds = null;
        foreach (var element in elements)
        {
            var box = element.get_BoundingBox(null);
            if (box is null) continue;
            bounds ??= new BoundingBoxXYZ
            {
                Min = box.Min,
                Max = box.Max
            };
            if (bounds is null) continue;
            bounds.Min = new XYZ(
                Math.Min(bounds.Min.X, box.Min.X),
                Math.Min(bounds.Min.Y, box.Min.Y),
                Math.Min(bounds.Min.Z, box.Min.Z));
            bounds.Max = new XYZ(
                Math.Max(bounds.Max.X, box.Max.X),
                Math.Max(bounds.Max.Y, box.Max.Y),
                Math.Max(bounds.Max.Z, box.Max.Z));
        }

        if (bounds is null) return null;
        const double marginFeet = 0.75 / 0.3048;
        bounds.Min = new XYZ(bounds.Min.X - marginFeet, bounds.Min.Y - marginFeet,
            bounds.Min.Z - marginFeet);
        bounds.Max = new XYZ(bounds.Max.X + marginFeet, bounds.Max.Y + marginFeet,
            bounds.Max.Z + marginFeet);
        return bounds;
    }

    private static void HideDefaultDatums(Document document, View view)
    {
        var ids = new FilteredElementCollector(document)
            .WhereElementIsNotElementType()
            .Where(element => element is Level or Grid)
            .Where(element => !IsGovernedElement(element))
            .Where(element => CanHide(element, view))
            .Select(element => element.Id)
            .ToList();
        if (ids.Count == 0) return;
        try { view.HideElements(ids); } catch { }
    }

    private static bool CanHide(Element element, View view)
    {
        try { return element.CanBeHidden(view); }
        catch { return false; }
    }

    private static bool IsGovernedElement(Element element)
    {
        var parameter = element.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
        var comments = parameter?.AsString();
        return comments?.StartsWith("FutolStructure ", StringComparison.OrdinalIgnoreCase) == true;
    }

    private static void TryActivateWorkspace(UIApplication application, Document document)
    {
        try
        {
            var view = new FilteredElementCollector(document)
                .OfClass(typeof(View3D))
                .Cast<View3D>()
                .FirstOrDefault(item => !item.IsTemplate &&
                    string.Equals(item.Name, "FS Structural Workspace", StringComparison.OrdinalIgnoreCase));
            if (view is not null && application.ActiveUIDocument is not null)
                application.ActiveUIDocument.RequestViewChange(view);
        }
        catch
        {
            // View activation is a presentation enhancement; import remains successful if Revit defers it.
        }
    }

    private static void ImportColumns(Document document, JsonElement columns, ImportAudit audit)
    {
        if (columns.ValueKind != JsonValueKind.Array)
        {
            audit.Warnings.Add("The manifest column collection is not an array; no columns were imported.");
            return;
        }

        var levels = new FilteredElementCollector(document)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .ToList();
        var existingColumns = new FilteredElementCollector(document)
            .OfCategory(BuiltInCategory.OST_StructuralColumns)
            .WhereElementIsNotElementType()
            .ToElements()
            .ToList();
        var symbols = new FilteredElementCollector(document)
            .OfCategory(BuiltInCategory.OST_StructuralColumns)
            .WhereElementIsElementType()
            .OfType<FamilySymbol>()
            .ToList();
        var preparedSymbols = new Dictionary<string, FamilySymbol?>(StringComparer.OrdinalIgnoreCase);

        foreach (var sourceColumn in columns.EnumerateArray())
        {
            var id = ReadString(sourceColumn, "id") ?? string.Empty;
            var startLevelName = ReadString(sourceColumn, "startLevel") ?? string.Empty;
            var endLevelName = ReadString(sourceColumn, "endLevel") ?? string.Empty;
            var section = ReadString(sourceColumn, "section") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(startLevelName) ||
                string.IsNullOrWhiteSpace(endLevelName) || string.IsNullOrWhiteSpace(section) ||
                !TryReadDouble(sourceColumn, "x", out var x) ||
                !TryReadDouble(sourceColumn, "y", out var y) ||
                !TryReadDouble(sourceColumn, "z1", out var z1) ||
                !TryReadDouble(sourceColumn, "z2", out var z2) ||
                !TryReadDouble(sourceColumn, "sourceSizeBmm", out var bMm) ||
                !TryReadDouble(sourceColumn, "sourceSizeHmm", out var hMm))
            {
                audit.ColumnsBlocked++;
                audit.Warnings.Add($"Skipped invalid column '{id}'.");
                continue;
            }

            if (!double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(z1) ||
                !double.IsFinite(z2) || !double.IsFinite(bMm) || !double.IsFinite(hMm) ||
                z2 <= z1 || bMm <= 0 || hMm <= 0)
            {
                audit.ColumnsBlocked++;
                audit.Warnings.Add($"Column '{id}' has invalid coordinates, elevation span, or section dimensions.");
                continue;
            }

            var commentToken = $"FutolStructure Column ID: {id}";
            var existing = existingColumns.FirstOrDefault(item =>
                GetComments(item).Contains(commentToken, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                audit.ColumnsMatched++;
                continue;
            }

            var baseLevel = levels.FirstOrDefault(item =>
                string.Equals(item.Name, startLevelName, StringComparison.OrdinalIgnoreCase));
            var topLevel = levels.FirstOrDefault(item =>
                string.Equals(item.Name, endLevelName, StringComparison.OrdinalIgnoreCase));
            if (baseLevel is null || topLevel is null)
            {
                audit.ColumnsBlocked++;
                audit.Warnings.Add($"Column '{id}' references missing levels '{startLevelName}' or '{endLevelName}'.");
                continue;
            }

            var angleDeg = TryReadDouble(sourceColumn, "sourceOrientationDeg", out var sourceAngle)
                ? sourceAngle
                : (TryReadDouble(sourceColumn, "orientationDeg", out var fallbackAngle) ? fallbackAngle : 0);
            var angleRad = -angleDeg * Math.PI / 180.0;
            var baseElevation = ToInternalMeters(z1);
            var topElevation = ToInternalMeters(z2);
            var location = new XYZ(ToInternalMeters(x), ToInternalMeters(y), baseElevation);
            var nativeCreated = false;
            var nativeElementId = ElementId.InvalidElementId;

            try
            {
                if (!preparedSymbols.ContainsKey(section))
                    preparedSymbols[section] = PrepareColumnSymbol(document, symbols, section, bMm, hMm);
                var symbol = preparedSymbols[section];
                if (symbol is not null)
                {
                    if (!symbol.IsActive) symbol.Activate();
                    var instance = document.Create.NewFamilyInstance(location, symbol, baseLevel, StructuralType.Column);
                    nativeElementId = instance.Id;
                    SetLevelParameter(instance, BuiltInParameter.FAMILY_BASE_LEVEL_PARAM, baseLevel.Id);
                    SetLevelParameter(instance, BuiltInParameter.FAMILY_TOP_LEVEL_PARAM, topLevel.Id);
                    SetOffsetParameter(instance, BuiltInParameter.FAMILY_BASE_LEVEL_OFFSET_PARAM, baseElevation - baseLevel.Elevation);
                    SetOffsetParameter(instance, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, topElevation - topLevel.Elevation);
                    if (Math.Abs(angleRad) > 1e-9)
                        ElementTransformUtils.RotateElement(document, instance.Id,
                            Line.CreateBound(location, location + XYZ.BasisZ), angleRad);
                    SetComments(instance, BuildColumnComments(commentToken, sourceColumn, "native-family", audit));
                    existingColumns.Add(instance);
                    audit.ColumnsCreated++;
                    audit.ColumnsNative++;
                    audit.ColumnRecords.Add(CreateColumnRecord(sourceColumn, id, section, "native-family", instance.Id));
                    nativeCreated = true;
                }
            }
            catch (Exception ex)
            {
                if (nativeElementId != ElementId.InvalidElementId)
                    document.Delete(nativeElementId);
                audit.Warnings.Add($"Native column family creation failed for '{id}'; exact governed proxy used. {ex.Message}");
            }

            if (nativeCreated) continue;

            try
            {
                var proxy = CreateColumnProxy(document, location, topElevation - baseElevation,
                    ToInternalMeters(bMm), ToInternalMeters(hMm), angleRad);
                SetComments(proxy, BuildColumnComments(commentToken, sourceColumn, "governed-proxy", audit));
                existingColumns.Add(proxy);
                audit.ColumnsCreated++;
                audit.ColumnsProxy++;
                audit.ColumnRecords.Add(CreateColumnRecord(sourceColumn, id, section, "governed-proxy", proxy.Id));
            }
            catch (Exception ex)
            {
                audit.ColumnsBlocked++;
                audit.Warnings.Add($"Column '{id}' could not be created as a native family or governed proxy: {ex.Message}");
            }
        }
    }

    private static void ImportConcreteMembers(Document document, JsonElement model, ImportAudit audit)
    {
        var frameSections = ReadFrameSections(model);
        var slabSections = ReadSlabSections(model);

        if (model.TryGetProperty("beams", out var beams))
            ImportBeams(document, beams, frameSections, audit);
        if (model.TryGetProperty("slabs", out var slabs))
            ImportSlabs(document, slabs, slabSections, audit);
        if (model.TryGetProperty("foundation", out var foundation) &&
            TryReadBool(foundation, "enabled", out var enabled) && enabled)
            ImportFoundationMembers(document, foundation, audit);
    }

    private static Dictionary<string, FrameSectionRecord> ReadFrameSections(JsonElement model)
    {
        var result = new Dictionary<string, FrameSectionRecord>(StringComparer.OrdinalIgnoreCase);
        if (!model.TryGetProperty("frameSections", out var sections) || sections.ValueKind != JsonValueKind.Array)
            return result;
        foreach (var section in sections.EnumerateArray())
        {
            var name = ReadString(section, "name") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name) ||
                !TryReadDouble(section, "bMm", out var bMm) ||
                !TryReadDouble(section, "hMm", out var hMm) ||
                bMm <= 0 || hMm <= 0)
                continue;
            result[name] = new FrameSectionRecord(name, bMm, hMm);
        }
        return result;
    }

    private static Dictionary<string, double> ReadSlabSections(JsonElement model)
    {
        var result = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        if (!model.TryGetProperty("slabSections", out var sections) || sections.ValueKind != JsonValueKind.Array)
            return result;
        foreach (var section in sections.EnumerateArray())
        {
            var name = ReadString(section, "name") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name) ||
                !TryReadDouble(section, "thicknessMm", out var thicknessMm) || thicknessMm <= 0)
                continue;
            result[name] = thicknessMm;
        }
        return result;
    }

    private static void ImportBeams(Document document, JsonElement beams,
        Dictionary<string, FrameSectionRecord> frameSections, ImportAudit audit)
    {
        if (beams.ValueKind != JsonValueKind.Array)
        {
            audit.Warnings.Add("The manifest beam collection is not an array; no beams were imported.");
            return;
        }

        foreach (var sourceBeam in beams.EnumerateArray())
        {
            var id = ReadString(sourceBeam, "id") ?? string.Empty;
            var sectionName = ReadString(sourceBeam, "section") ?? string.Empty;
            var floorId = ReadString(sourceBeam, "floorId") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(sectionName) ||
                !frameSections.TryGetValue(sectionName, out var section) ||
                !TryReadDouble(sourceBeam, "z", out var topElevation) ||
                !TryReadBeamAxis(sourceBeam, out var axis))
            {
                audit.BeamsBlocked++;
                audit.Warnings.Add($"Skipped invalid beam '{id}'.");
                continue;
            }

            var token = $"FutolStructure Beam ID: {id}";
            var existing = FindElementsByComment(document, BuiltInCategory.OST_StructuralFraming, token).FirstOrDefault();
            if (existing is not null)
            {
                audit.BeamsMatched++;
                continue;
            }

            var beamFootprint = BuildBeamFootprint(axis, section.BMm);
            var bottomElevation = topElevation - section.HMm / 1000.0;
            try
            {
                var beam = CreateConcreteProxy(document, beamFootprint, bottomElevation, topElevation,
                    BuiltInCategory.OST_StructuralFraming);
                SetComments(beam, BuildMemberComments(token, sourceBeam, "governed-proxy", audit));
                audit.BeamsCreated++;
                audit.ConcreteRecords.Add(CreateConcreteRecord(sourceBeam, id, floorId, sectionName,
                    "Beam", "governed-proxy", beam.Id, axis.X1, axis.Y1, axis.X2, axis.Y2,
                    bottomElevation, topElevation, section.BMm, section.HMm));
            }
            catch (Exception ex)
            {
                audit.BeamsBlocked++;
                audit.Warnings.Add($"Beam '{id}' could not be created: {ex.Message}");
            }
        }
    }

    private static void ImportSlabs(Document document, JsonElement slabs,
        Dictionary<string, double> slabSections, ImportAudit audit)
    {
        if (slabs.ValueKind != JsonValueKind.Array)
        {
            audit.Warnings.Add("The manifest slab collection is not an array; no slabs were imported.");
            return;
        }

        foreach (var sourceSlab in slabs.EnumerateArray())
        {
            var id = ReadString(sourceSlab, "id") ?? string.Empty;
            var sectionName = ReadString(sourceSlab, "section") ?? string.Empty;
            var floorId = ReadString(sourceSlab, "floorId") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(sectionName) ||
                !slabSections.TryGetValue(sectionName, out var thicknessMm) ||
                !TryReadDouble(sourceSlab, "z", out var topElevation) ||
                !TryReadFootprint(sourceSlab, "points", out var footprint) || footprint.Count < 3)
            {
                audit.SlabsBlocked++;
                audit.Warnings.Add($"Skipped invalid slab '{id}'.");
                continue;
            }

            var token = $"FutolStructure Slab ID: {id}";
            var existing = FindElementsByComment(document, BuiltInCategory.OST_Floors, token).FirstOrDefault();
            if (existing is not null)
            {
                audit.SlabsMatched++;
                continue;
            }

            var bottomElevation = topElevation - thicknessMm / 1000.0;
            try
            {
                var slab = CreateConcreteProxy(document, footprint, bottomElevation, topElevation,
                    BuiltInCategory.OST_Floors);
                SetComments(slab, BuildMemberComments(token, sourceSlab, "governed-proxy", audit));
                audit.SlabsCreated++;
                audit.ConcreteRecords.Add(CreateConcreteRecord(sourceSlab, id, floorId, sectionName,
                    "Slab", "governed-proxy", slab.Id, 0, 0, 0, 0, bottomElevation, topElevation,
                    0, thicknessMm));
            }
            catch (Exception ex)
            {
                audit.SlabsBlocked++;
                audit.Warnings.Add($"Slab '{id}' could not be created: {ex.Message}");
            }
        }
    }

    private static void ImportFoundationMembers(Document document, JsonElement foundation, ImportAudit audit)
    {
        if (foundation.TryGetProperty("footings", out var footings))
            ImportFootings(document, footings, audit);
        if (foundation.TryGetProperty("pedestals", out var pedestals))
            ImportPedestals(document, pedestals, audit);
        if (foundation.TryGetProperty("tieBeams", out var tieBeams))
            ImportTieBeams(document, tieBeams, audit);
    }

    private static void ImportFootings(Document document, JsonElement footings, ImportAudit audit)
    {
        if (footings.ValueKind != JsonValueKind.Array) return;
        foreach (var sourceFooting in footings.EnumerateArray())
        {
            var id = ReadString(sourceFooting, "id") ?? string.Empty;
            var floorId = ReadString(sourceFooting, "floorId") ?? "BASE/FOUNDATION";
            if (!TryReadDouble(sourceFooting, "x", out var x) ||
                !TryReadDouble(sourceFooting, "y", out var y) ||
                !TryReadDouble(sourceFooting, "width", out var width) ||
                !TryReadDouble(sourceFooting, "length", out var length) ||
                !TryReadDouble(sourceFooting, "bottomElevation", out var bottom) ||
                !TryReadDouble(sourceFooting, "topElevation", out var top) ||
                width <= 0 || length <= 0 || top <= bottom)
            {
                audit.FootingsBlocked++;
                audit.Warnings.Add($"Skipped invalid footing '{id}'.");
                continue;
            }

            var token = $"FutolStructure Footing ID: {id}";
            if (FindElementsByComment(document, BuiltInCategory.OST_StructuralFoundation, token).Any())
            {
                audit.FootingsMatched++;
                continue;
            }

            var footprint = BuildRectangularFootprint(x, y, width, length,
                TryReadDouble(sourceFooting, "orientationDeg", out var angle) ? angle : 0);
            try
            {
                var footing = CreateConcreteProxy(document, footprint, bottom, top,
                    BuiltInCategory.OST_StructuralFoundation);
                SetComments(footing, BuildMemberComments(token, sourceFooting, "governed-proxy", audit));
                audit.FootingsCreated++;
                    audit.ConcreteRecords.Add(CreateConcreteRecord(sourceFooting, id, floorId, "Footing",
                    "Isolated Footing", "governed-proxy", footing.Id, x, y, x, y, bottom, top,
                    width * 1000.0, length * 1000.0));
            }
            catch (Exception ex)
            {
                audit.FootingsBlocked++;
                audit.Warnings.Add($"Footing '{id}' could not be created: {ex.Message}");
            }
        }
    }

    private static void ImportPedestals(Document document, JsonElement pedestals, ImportAudit audit)
    {
        if (pedestals.ValueKind != JsonValueKind.Array) return;
        foreach (var sourcePedestal in pedestals.EnumerateArray())
        {
            var id = ReadString(sourcePedestal, "id") ?? string.Empty;
            var floorId = ReadString(sourcePedestal, "floorId") ?? "BASE/FOUNDATION";
            if (!TryReadDouble(sourcePedestal, "x", out var x) ||
                !TryReadDouble(sourcePedestal, "y", out var y) ||
                !TryReadDouble(sourcePedestal, "width", out var width) ||
                !TryReadDouble(sourcePedestal, "length", out var length) ||
                !TryReadDouble(sourcePedestal, "bottomElevation", out var bottom) ||
                !TryReadDouble(sourcePedestal, "topElevation", out var top) ||
                width <= 0 || length <= 0 || top <= bottom)
            {
                audit.PedestalsBlocked++;
                audit.Warnings.Add($"Skipped invalid pedestal '{id}'.");
                continue;
            }

            var token = $"FutolStructure Pedestal ID: {id}";
            if (FindElementsByComment(document, BuiltInCategory.OST_StructuralFoundation, token).Any())
            {
                audit.PedestalsMatched++;
                continue;
            }

            var orientation = TryReadDouble(sourcePedestal, "orientationDeg", out var angle) ? angle : 0;
            var footprint = BuildRectangularFootprint(x, y, width, length, orientation);
            try
            {
                var pedestal = CreateConcreteProxy(document, footprint, bottom, top,
                    BuiltInCategory.OST_StructuralFoundation);
                SetComments(pedestal, BuildMemberComments(token, sourcePedestal, "governed-proxy", audit));
                audit.PedestalsCreated++;
                audit.ConcreteRecords.Add(CreateConcreteRecord(sourcePedestal, id, floorId, "Pedestal",
                    "Pedestal", "governed-proxy", pedestal.Id, x, y, x, y, bottom, top,
                    width * 1000.0, length * 1000.0));
            }
            catch (Exception ex)
            {
                audit.PedestalsBlocked++;
                audit.Warnings.Add($"Pedestal '{id}' could not be created: {ex.Message}");
            }
        }
    }

    private static void ImportTieBeams(Document document, JsonElement tieBeams, ImportAudit audit)
    {
        if (tieBeams.ValueKind != JsonValueKind.Array) return;
        foreach (var sourceTieBeam in tieBeams.EnumerateArray())
        {
            var id = ReadString(sourceTieBeam, "id") ?? string.Empty;
            var floorId = ReadString(sourceTieBeam, "floorId") ?? "BASE/FOUNDATION";
            if (!TryReadDouble(sourceTieBeam, "bottomElevation", out var bottom) ||
                !TryReadDouble(sourceTieBeam, "topElevation", out var top) ||
                !TryReadFootprint(sourceTieBeam, "footprint", out var footprint) ||
                footprint.Count < 3 || top <= bottom)
            {
                audit.TieBeamsBlocked++;
                audit.Warnings.Add($"Skipped invalid tie beam '{id}'.");
                continue;
            }

            var token = $"FutolStructure Tie Beam ID: {id}";
            if (FindElementsByComment(document, BuiltInCategory.OST_StructuralFraming, token).Any())
            {
                audit.TieBeamsMatched++;
                continue;
            }

            try
            {
                var tieBeam = CreateConcreteProxy(document, footprint, bottom, top,
                    BuiltInCategory.OST_StructuralFraming);
                SetComments(tieBeam, BuildMemberComments(token, sourceTieBeam, "governed-proxy", audit));
                audit.TieBeamsCreated++;
                audit.ConcreteRecords.Add(CreateConcreteRecord(sourceTieBeam, id, floorId, "Tie Beam",
                    "Foundation Tie Beam", "governed-proxy", tieBeam.Id, 0, 0, 0, 0, bottom, top,
                    0, 0));
            }
            catch (Exception ex)
            {
                audit.TieBeamsBlocked++;
                audit.Warnings.Add($"Tie beam '{id}' could not be created: {ex.Message}");
            }
        }
    }

    private static List<Element> FindElementsByComment(Document document, BuiltInCategory category, string token)
    {
        return new FilteredElementCollector(document)
            .OfCategory(category)
            .WhereElementIsNotElementType()
            .Where(item => GetComments(item).Contains(token, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    private static DirectShape CreateConcreteProxy(Document document, IReadOnlyList<XYZ> footprint,
        double bottomElevationMeters, double topElevationMeters, BuiltInCategory category)
    {
        if (footprint.Count < 3 || topElevationMeters <= bottomElevationMeters)
            throw new InvalidOperationException("Invalid concrete footprint or elevation range.");

        var profile = new CurveLoop();
        for (var index = 0; index < footprint.Count; index++)
        {
            var start = footprint[index];
            var end = footprint[(index + 1) % footprint.Count];
            if (start.DistanceTo(end) <= CoordinateToleranceFeet) continue;
            profile.Append(Line.CreateBound(start, end));
        }

        var height = ToInternalMeters(topElevationMeters - bottomElevationMeters);
        var solid = GeometryCreationUtilities.CreateExtrusionGeometry(
            new List<CurveLoop> { profile }, XYZ.BasisZ, height);
        solid = SolidUtils.CreateTransformed(solid,
            Transform.CreateTranslation(new XYZ(0, 0, ToInternalMeters(bottomElevationMeters))));
        var shape = DirectShape.CreateElement(document, new ElementId(category));
        shape.SetShape(new List<GeometryObject> { solid });
        return shape;
    }

    private static List<XYZ> BuildBeamFootprint(BeamAxisRecord axis, double widthMm)
    {
        var x1 = ToInternalMeters(axis.X1);
        var y1 = ToInternalMeters(axis.Y1);
        var x2 = ToInternalMeters(axis.X2);
        var y2 = ToInternalMeters(axis.Y2);
        var dx = x2 - x1;
        var dy = y2 - y1;
        var length = Math.Sqrt(dx * dx + dy * dy);
        if (length <= CoordinateToleranceFeet) throw new InvalidOperationException("Beam axis is too short.");
        var halfWidth = ToInternalMeters(widthMm / 2000.0);
        var px = -dy / length * halfWidth;
        var py = dx / length * halfWidth;
        return [
            new XYZ(x1 - px, y1 - py, 0),
            new XYZ(x2 - px, y2 - py, 0),
            new XYZ(x2 + px, y2 + py, 0),
            new XYZ(x1 + px, y1 + py, 0)
        ];
    }

    private static List<XYZ> BuildRectangularFootprint(double x, double y, double width, double length,
        double orientationDeg)
    {
        var halfX = width / 2.0;
        var halfY = length / 2.0;
        var angle = -orientationDeg * Math.PI / 180.0;
        var cos = Math.Cos(angle);
        var sin = Math.Sin(angle);
        var points = new[]
        {
            (-halfX, -halfY), (halfX, -halfY), (halfX, halfY), (-halfX, halfY)
        };
        return points.Select(point => new XYZ(
            ToInternalMeters(x + point.Item1 * cos - point.Item2 * sin),
            ToInternalMeters(y + point.Item1 * sin + point.Item2 * cos),
            0)).ToList();
    }

    private static bool TryReadBeamAxis(JsonElement sourceBeam, out BeamAxisRecord axis)
    {
        var source = sourceBeam.TryGetProperty("drawingAxis", out var drawingAxis) &&
            drawingAxis.ValueKind == JsonValueKind.Object ? drawingAxis : sourceBeam;
        axis = new BeamAxisRecord(0, 0, 0, 0);
        if (!TryReadDouble(source, "x1", out var x1) || !TryReadDouble(source, "y1", out var y1) ||
            !TryReadDouble(source, "x2", out var x2) || !TryReadDouble(source, "y2", out var y2))
            return false;
        axis = new BeamAxisRecord(x1, y1, x2, y2);
        return Math.Sqrt(Math.Pow(x2 - x1, 2) + Math.Pow(y2 - y1, 2)) > CoordinateToleranceFeet;
    }

    private static bool TryReadFootprint(JsonElement element, string propertyName, out List<XYZ> footprint)
    {
        footprint = [];
        if (!element.TryGetProperty(propertyName, out var points) || points.ValueKind != JsonValueKind.Array)
            return false;
        foreach (var point in points.EnumerateArray())
        {
            if (!TryReadDouble(point, "x", out var x) || !TryReadDouble(point, "y", out var y))
                return false;
            footprint.Add(new XYZ(ToInternalMeters(x), ToInternalMeters(y), 0));
        }
        return footprint.Count >= 3;
    }

    private static string BuildMemberComments(string token, JsonElement sourceMember, string mode,
        ImportAudit audit)
    {
        var sourceId = ReadString(sourceMember, "sourceId") ?? string.Empty;
        var floorId = ReadString(sourceMember, "floorId") ?? string.Empty;
        var section = ReadString(sourceMember, "section") ?? string.Empty;
        var material = ReadString(sourceMember, "material") ?? "Concrete";
        var designStatus = ReadString(sourceMember, "designStatus") ?? string.Empty;
        var supportedColumnId = ReadString(sourceMember, "supportedColumnId") ?? string.Empty;
        var dimensions = ReadMemberDimensions(sourceMember);
        var elevations = ReadMemberElevations(sourceMember);
        var provenance = audit.Provenance;
        return string.Join(" | ", new[]
        {
            token,
            $"source={sourceId}",
            $"floor={floorId}",
            string.IsNullOrWhiteSpace(section) ? null : $"section={section}",
            $"material={material}",
            string.IsNullOrWhiteSpace(designStatus) ? null : $"status={designStatus}",
            string.IsNullOrWhiteSpace(supportedColumnId) ? null : $"supportedColumn={supportedColumnId}",
            string.IsNullOrWhiteSpace(dimensions) ? null : dimensions,
            string.IsNullOrWhiteSpace(elevations) ? null : elevations,
            $"project={provenance.ProjectId}",
            $"revision={provenance.RevisionId}",
            $"build={provenance.BuildId}",
            $"import={mode}"
        }.Where(item => !string.IsNullOrWhiteSpace(item)));
    }

    private static string BuildColumnComments(string token, JsonElement sourceColumn, string mode,
        ImportAudit audit)
    {
        var segment = ReadString(sourceColumn, "segmentId") ?? string.Empty;
        var sourceId = ReadString(sourceColumn, "sourceId") ?? string.Empty;
        var section = ReadString(sourceColumn, "section") ?? string.Empty;
        var width = TryReadDouble(sourceColumn, "sourceSizeBmm", out var widthMm) ? widthMm : 0;
        var depth = TryReadDouble(sourceColumn, "sourceSizeHmm", out var depthMm) ? depthMm : 0;
        var z1 = TryReadDouble(sourceColumn, "z1", out var bottom) ? bottom : 0;
        var z2 = TryReadDouble(sourceColumn, "z2", out var top) ? top : 0;
        var angle = TryReadDouble(sourceColumn, "sourceOrientationDeg", out var orientation) ? orientation : 0;
        var provenance = audit.Provenance;
        return string.Join(" | ", new[]
        {
            token,
            $"source={sourceId}",
            string.IsNullOrWhiteSpace(segment) ? null : $"segment={segment}",
            string.IsNullOrWhiteSpace(section) ? null : $"section={section}",
            $"size={widthMm:0.###}x{depthMm:0.###}mm",
            $"elev={z1:0.###}->{z2:0.###}m",
            $"orientation={angle:0.###}deg",
            $"project={provenance.ProjectId}",
            $"revision={provenance.RevisionId}",
            $"build={provenance.BuildId}",
            $"import={mode}"
        }.Where(item => !string.IsNullOrWhiteSpace(item)));
    }

    private static string ReadMemberDimensions(JsonElement sourceMember)
    {
        if (TryReadDouble(sourceMember, "bMm", out var bMm) &&
            TryReadDouble(sourceMember, "hMm", out var hMm))
            return $"size={bMm:0.###}x{hMm:0.###}mm";
        if (TryReadDouble(sourceMember, "width", out var width) &&
            TryReadDouble(sourceMember, "length", out var length))
            return $"plan={width:0.###}x{length:0.###}m";
        if (TryReadDouble(sourceMember, "widthMm", out var widthMm) &&
            TryReadDouble(sourceMember, "depthMm", out var depthMm))
            return $"size={widthMm:0.###}x{depthMm:0.###}mm";
        return string.Empty;
    }

    private static string ReadMemberElevations(JsonElement sourceMember)
    {
        if (TryReadDouble(sourceMember, "bottomElevation", out var bottom) &&
            TryReadDouble(sourceMember, "topElevation", out var top))
            return $"elev={bottom:0.###}->{top:0.###}m";
        if (TryReadDouble(sourceMember, "z", out var z))
            return $"top={z:0.###}m";
        return string.Empty;
    }

    private static ConcreteImportRecord CreateConcreteRecord(JsonElement sourceMember, string id, string floorId,
        string section, string memberType, string mode, ElementId elementId, double x1, double y1,
        double x2, double y2, double bottom, double top, double widthMm, double depthMm)
    {
        return new ConcreteImportRecord
        {
            SourceId = id,
            FloorId = floorId,
            MemberType = memberType,
            Section = section,
            Mode = mode,
            RevitElementId = elementId.ToString(),
            X1 = x1,
            Y1 = y1,
            X2 = x2,
            Y2 = y2,
            BottomElevation = bottom,
            TopElevation = top,
            WidthMm = widthMm,
            DepthMm = depthMm
        };
    }

    private static FamilySymbol? PrepareColumnSymbol(Document document, List<FamilySymbol> symbols,
        string section, double bMm, double hMm)
    {
        var exact = symbols.FirstOrDefault(item =>
            string.Equals(item.Name, section, StringComparison.OrdinalIgnoreCase) ||
            string.Equals($"{item.FamilyName}:{item.Name}", section, StringComparison.OrdinalIgnoreCase));
        if (exact is not null) return exact;

        var candidate = symbols.FirstOrDefault(item =>
            FindParameter(item, "Width", "B", "b", "Column Width") is not null &&
            FindParameter(item, "Depth", "H", "h", "Column Depth") is not null);
        if (candidate is null) return null;

        var safeName = new string(section.Select(character =>
            char.IsLetterOrDigit(character) ? character : '_').ToArray());
        if (candidate.Duplicate($"FutolStructure_{safeName}") is not FamilySymbol duplicate) return null;
        if (!SetDimensionParameter(duplicate, bMm, "Width", "B", "b", "Column Width") ||
            !SetDimensionParameter(duplicate, hMm, "Depth", "H", "h", "Column Depth"))
            return null;
        return duplicate;
    }

    private static DirectShape CreateColumnProxy(Document document, XYZ location, double height,
        double width, double depth, double angleRad)
    {
        var halfWidth = width / 2.0;
        var halfDepth = depth / 2.0;
        var profile = new CurveLoop();
        profile.Append(Line.CreateBound(new XYZ(-halfWidth, -halfDepth, 0), new XYZ(halfWidth, -halfDepth, 0)));
        profile.Append(Line.CreateBound(new XYZ(halfWidth, -halfDepth, 0), new XYZ(halfWidth, halfDepth, 0)));
        profile.Append(Line.CreateBound(new XYZ(halfWidth, halfDepth, 0), new XYZ(-halfWidth, halfDepth, 0)));
        profile.Append(Line.CreateBound(new XYZ(-halfWidth, halfDepth, 0), new XYZ(-halfWidth, -halfDepth, 0)));
        var solid = GeometryCreationUtilities.CreateExtrusionGeometry(
            new List<CurveLoop> { profile }, XYZ.BasisZ, height);
        if (Math.Abs(angleRad) > 1e-9)
            solid = SolidUtils.CreateTransformed(solid, Transform.CreateRotation(XYZ.BasisZ, angleRad));
        solid = SolidUtils.CreateTransformed(solid, Transform.CreateTranslation(location));
        var shape = DirectShape.CreateElement(document, new ElementId(BuiltInCategory.OST_StructuralColumns));
        shape.SetShape(new List<GeometryObject> { solid });
        return shape;
    }

    private static ColumnImportRecord CreateColumnRecord(JsonElement sourceColumn, string id,
        string section, string mode, ElementId elementId)
    {
        return new ColumnImportRecord
        {
            SourceId = id,
            Section = section,
            Mode = mode,
            RevitElementId = elementId.ToString(),
            X = TryReadDouble(sourceColumn, "x", out var x) ? x : 0,
            Y = TryReadDouble(sourceColumn, "y", out var y) ? y : 0,
            Z1 = TryReadDouble(sourceColumn, "z1", out var z1) ? z1 : 0,
            Z2 = TryReadDouble(sourceColumn, "z2", out var z2) ? z2 : 0,
            OrientationDeg = TryReadDouble(sourceColumn, "sourceOrientationDeg", out var angle) ? angle : 0,
            WidthMm = TryReadDouble(sourceColumn, "sourceSizeBmm", out var width) ? width : 0,
            DepthMm = TryReadDouble(sourceColumn, "sourceSizeHmm", out var depth) ? depth : 0
        };
    }

    private static Parameter? FindParameter(Element element, params string[] names)
    {
        foreach (var name in names)
        {
            var parameter = element.LookupParameter(name);
            if (parameter is { IsReadOnly: false }) return parameter;
        }
        return null;
    }

    private static bool SetDimensionParameter(Element element, double millimeters, params string[] names)
    {
        var parameter = FindParameter(element, names);
        return parameter is not null && parameter.Set(ToInternalMeters(millimeters / 1000.0));
    }

    private static void SetLevelParameter(Element element, BuiltInParameter parameterId, ElementId value)
    {
        var parameter = element.get_Parameter(parameterId);
        if (parameter is { IsReadOnly: false }) parameter.Set(value);
    }

    private static void SetOffsetParameter(Element element, BuiltInParameter parameterId, double value)
    {
        var parameter = element.get_Parameter(parameterId);
        if (parameter is { IsReadOnly: false }) parameter.Set(value);
    }

    private static void CreateOrMatchGrid(Document document, List<Grid> existing, string name, Line curve,
        bool constantX, double expectedCoordinate, ImportAudit audit)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            audit.GridsBlocked++;
            audit.Warnings.Add("Skipped an unnamed grid.");
            return;
        }
        var namedGrid = existing.FirstOrDefault(item => string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase));
        if (namedGrid is not null)
        {
            var endpoint = namedGrid.Curve.GetEndPoint(0);
            var actualCoordinate = constantX ? endpoint.X : endpoint.Y;
            if (Math.Abs(actualCoordinate - expectedCoordinate) > CoordinateToleranceFeet)
            {
                audit.GridsBlocked++;
                audit.Warnings.Add($"Grid '{name}' exists at a different coordinate and was not modified.");
                return;
            }
            audit.GridsMatched++;
            SetComments(namedGrid, $"FutolStructure Grid ID: {name}");
            return;
        }
        var grid = Grid.Create(document, curve);
        grid.Name = name;
        SetComments(grid, $"FutolStructure Grid ID: {name}");
        existing.Add(grid);
        audit.GridsCreated++;
    }

    private static List<GridLineRecord> ReadGridLines(JsonElement definition, string propertyName)
    {
        var result = new List<GridLineRecord>();
        if (!definition.TryGetProperty(propertyName, out var lines) || lines.ValueKind != JsonValueKind.Array) return result;
        foreach (var line in lines.EnumerateArray())
        {
            var label = ReadString(line, "label") ?? string.Empty;
            if (TryReadDouble(line, "coordinateM", out var coordinate)) result.Add(new GridLineRecord(label, coordinate));
        }
        return result;
    }

    private static string WriteAudit(string manifestPath, ImportAudit audit)
    {
        var directory = Path.GetDirectoryName(manifestPath) ?? Environment.CurrentDirectory;
        var sourceName = Path.GetFileNameWithoutExtension(manifestPath);
        var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        var path = Path.Combine(directory, $"{sourceName}.revit-import-audit-{timestamp}.json");
        File.WriteAllText(path, JsonSerializer.Serialize(audit, new JsonSerializerOptions { WriteIndented = true }));
        return path;
    }

    private static void SetComments(Element element, string value)
    {
        var parameter = element.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
        if (parameter is { IsReadOnly: false }) parameter.Set(value);
    }

    private static string GetComments(Element element)
    {
        var parameter = element.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS);
        return parameter?.AsString() ?? string.Empty;
    }

    private static string? ReadString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool TryReadDouble(JsonElement element, string propertyName, out double result)
    {
        result = 0;
        return element.TryGetProperty(propertyName, out var value) && value.TryGetDouble(out result);
    }

    private static bool TryReadBool(JsonElement element, string propertyName, out bool result)
    {
        result = false;
        if (!element.TryGetProperty(propertyName, out var value) ||
            (value.ValueKind != JsonValueKind.True && value.ValueKind != JsonValueKind.False))
            return false;
        result = value.GetBoolean();
        return true;
    }

    private static double ToInternalMeters(double meters) => UnitUtils.ConvertToInternalUnits(meters, UnitTypeId.Meters);
    private sealed record GridLineRecord(string Label, double CoordinateM);
    private sealed record FrameSectionRecord(string Name, double BMm, double HMm);
    private sealed record BeamAxisRecord(double X1, double Y1, double X2, double Y2);

    private sealed class ImportProvenance
    {
        public string ProjectId { get; init; } = "unknown-project";
        public string RevisionId { get; init; } = "unknown-revision";
        public string BuildId { get; init; } = "unknown-build";
        public string AppVersion { get; init; } = string.Empty;
        public string SchemaVersion { get; init; } = string.Empty;

        public static ImportProvenance FromJson(JsonElement value)
        {
            return new ImportProvenance
            {
                ProjectId = ReadString(value, "projectId") ?? "unknown-project",
                RevisionId = ReadString(value, "sourceRevisionId") ?? "unknown-revision",
                BuildId = ReadString(value, "buildId") ?? "unknown-build",
                AppVersion = ReadString(value, "appVersion") ?? string.Empty,
                SchemaVersion = ReadString(value, "schemaVersion") ?? string.Empty
            };
        }
    }

    private sealed class ImportAudit
    {
        public string? Contract { get; set; }
        public string? ManifestPath { get; set; }
        public string? RevitVersion { get; set; }
        public DateTimeOffset StartedAt { get; set; }
        public DateTimeOffset CompletedAt { get; set; }
        public ImportProvenance Provenance { get; set; } = new();
        public int LevelsCreated { get; set; }
        public int LevelsMatched { get; set; }
        public int LevelsBlocked { get; set; }
        public int GridsCreated { get; set; }
        public int GridsMatched { get; set; }
        public int GridsBlocked { get; set; }
        public int ColumnsCreated { get; set; }
        public int ColumnsMatched { get; set; }
        public int ColumnsBlocked { get; set; }
        public int ColumnsNative { get; set; }
        public int ColumnsProxy { get; set; }
        public List<ColumnImportRecord> ColumnRecords { get; } = [];
        public int BeamsCreated { get; set; }
        public int BeamsMatched { get; set; }
        public int BeamsBlocked { get; set; }
        public int SlabsCreated { get; set; }
        public int SlabsMatched { get; set; }
        public int SlabsBlocked { get; set; }
        public int FootingsCreated { get; set; }
        public int FootingsMatched { get; set; }
        public int FootingsBlocked { get; set; }
        public int PedestalsCreated { get; set; }
        public int PedestalsMatched { get; set; }
        public int PedestalsBlocked { get; set; }
        public int TieBeamsCreated { get; set; }
        public int TieBeamsMatched { get; set; }
        public int TieBeamsBlocked { get; set; }
        public string WorkspaceView { get; set; } = string.Empty;
        public List<ConcreteImportRecord> ConcreteRecords { get; } = [];
        public string RebarStatus { get; set; } = "PENDING_APPROVED_DESIGN_RESULTS";
        public List<string> Warnings { get; } = [];
        public List<string> Errors { get; } = [];
    }

    private sealed class ColumnImportRecord
    {
        public string SourceId { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string Mode { get; set; } = string.Empty;
        public string RevitElementId { get; set; } = string.Empty;
        public double X { get; set; }
        public double Y { get; set; }
        public double Z1 { get; set; }
        public double Z2 { get; set; }
        public double OrientationDeg { get; set; }
        public double WidthMm { get; set; }
        public double DepthMm { get; set; }
    }

    private sealed class ConcreteImportRecord
    {
        public string SourceId { get; set; } = string.Empty;
        public string FloorId { get; set; } = string.Empty;
        public string MemberType { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string Mode { get; set; } = string.Empty;
        public string RevitElementId { get; set; } = string.Empty;
        public double X1 { get; set; }
        public double Y1 { get; set; }
        public double X2 { get; set; }
        public double Y2 { get; set; }
        public double BottomElevation { get; set; }
        public double TopElevation { get; set; }
        public double WidthMm { get; set; }
        public double DepthMm { get; set; }
    }
}
