using System.IO;
using System.Text.Json;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Microsoft.Win32;

namespace FutolStructure.Revit2027;

[Transaction(TransactionMode.Manual)]
public sealed class FutolStructureCommand : IExternalCommand
{
    private const double CoordinateToleranceFeet = 1e-5;

    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Open FutolStructure Revit import manifest",
            Filter = "FutolStructure Revit manifest (*.json)|*.json|All files (*.*)|*.*",
            CheckFileExists = true,
            Multiselect = false
        };
        if (dialog.ShowDialog() != true) return Result.Cancelled;

        JsonDocument manifestDocument;
        try
        {
            manifestDocument = JsonDocument.Parse(File.ReadAllText(dialog.FileName));
        }
        catch (Exception ex)
        {
            message = $"Manifest JSON could not be read: {ex.Message}";
            return Result.Failed;
        }

        using (manifestDocument)
        {
            var root = manifestDocument.RootElement;
            var contract = ReadString(root, "contract");
            if (contract != "FutolStructure.RevitNativeImport.v1")
            {
                message = "Unsupported FutolStructure Revit import contract.";
                return Result.Failed;
            }
            if (!root.TryGetProperty("source", out var source) ||
                !source.TryGetProperty("levels", out var levels) ||
                levels.ValueKind != JsonValueKind.Array)
            {
                message = "The manifest has no governed source levels.";
                return Result.Failed;
            }

            var uiDocument = commandData.Application.ActiveUIDocument;
            if (uiDocument is null)
            {
                message = "Open a Revit project before importing FutolStructure data.";
                return Result.Failed;
            }

            var audit = new ImportAudit
            {
                Contract = contract,
                ManifestPath = dialog.FileName,
                RevitVersion = commandData.Application.Application.VersionNumber,
                StartedAt = DateTimeOffset.UtcNow
            };
            try
            {
                using var transaction = new Transaction(uiDocument.Document, "FutolStructure governed levels and grids");
                transaction.Start();
                ImportLevels(uiDocument.Document, levels, audit);
                if (source.TryGetProperty("gridDefinition", out var gridDefinition))
                    ImportGrids(uiDocument.Document, gridDefinition, audit);
                transaction.Commit();
            }
            catch (Exception ex)
            {
                audit.Errors.Add(ex.Message);
                audit.CompletedAt = DateTimeOffset.UtcNow;
                WriteAudit(dialog.FileName, audit);
                message = $"FutolStructure import failed: {ex.Message}";
                return Result.Failed;
            }

            audit.RebarStatus = root.TryGetProperty("rebar", out var rebar)
                ? ReadString(rebar, "status") ?? "PENDING_APPROVED_DESIGN_RESULTS"
                : "PENDING_APPROVED_DESIGN_RESULTS";
            audit.CompletedAt = DateTimeOffset.UtcNow;
            var auditPath = WriteAudit(dialog.FileName, audit);
            TaskDialog.Show(
                "FutolStructure Revit Import",
                $"Manifest validated: {contract}\n\n" +
                $"Levels created / matched / blocked: {audit.LevelsCreated} / {audit.LevelsMatched} / {audit.LevelsBlocked}\n" +
                $"Grids created / matched / blocked: {audit.GridsCreated} / {audit.GridsMatched} / {audit.GridsBlocked}\n" +
                $"Rebar handoff: {audit.RebarStatus}\n\nAudit: {auditPath}\n\n" +
                "This milestone imports governed levels and grids. Structural members and approved reinforcement remain separate acceptance steps.");
            return Result.Succeeded;
        }
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

    private static string? ReadString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool TryReadDouble(JsonElement element, string propertyName, out double result)
    {
        result = 0;
        return element.TryGetProperty(propertyName, out var value) && value.TryGetDouble(out result);
    }

    private static double ToInternalMeters(double meters) => UnitUtils.ConvertToInternalUnits(meters, UnitTypeId.Meters);
    private sealed record GridLineRecord(string Label, double CoordinateM);

    private sealed class ImportAudit
    {
        public string? Contract { get; set; }
        public string? ManifestPath { get; set; }
        public string? RevitVersion { get; set; }
        public DateTimeOffset StartedAt { get; set; }
        public DateTimeOffset CompletedAt { get; set; }
        public int LevelsCreated { get; set; }
        public int LevelsMatched { get; set; }
        public int LevelsBlocked { get; set; }
        public int GridsCreated { get; set; }
        public int GridsMatched { get; set; }
        public int GridsBlocked { get; set; }
        public string RebarStatus { get; set; } = "PENDING_APPROVED_DESIGN_RESULTS";
        public List<string> Warnings { get; } = [];
        public List<string> Errors { get; } = [];
    }
}
