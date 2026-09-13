using System.Globalization;
using System.IO;
using System.Text;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FutolStructure.Revit2027;

[Transaction(TransactionMode.Manual)]
public sealed class FutolStructureBoqCommand : IExternalCommand
{
    private const string FsToken = "FutolStructure";

    private static readonly BoqSpec[] Specs =
    {
        new(BuiltInCategory.OST_StructuralColumns, "FS BOQ - Columns", "Structural Columns"),
        new(BuiltInCategory.OST_StructuralFraming, "FS BOQ - Structural Framing", "Beams and Tie Beams"),
        new(BuiltInCategory.OST_Floors, "FS BOQ - Slabs", "Slabs"),
        new(BuiltInCategory.OST_StructuralFoundation, "FS BOQ - Foundations", "Footings and Pedestals")
    };

    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var document = commandData.Application.ActiveUIDocument?.Document;
        if (document is null)
        {
            message = "Open the imported FutolStructure Revit project before generating the BOQ.";
            return Result.Failed;
        }

        var summaries = Specs.Select(spec => CollectSummary(document, spec)).ToList();
        var scheduleNames = new List<string>();

        try
        {
            using var transaction = new Transaction(document, "FutolStructure BOQ schedules");
            transaction.Start();
            foreach (var spec in Specs)
            {
                var schedule = GetOrCreateSchedule(document, spec);
                ConfigureSchedule(document, schedule, spec);
                scheduleNames.Add(schedule.Name);
            }
            transaction.Commit();
        }
        catch (Exception ex)
        {
            message = $"The FutolStructure BOQ schedules could not be created: {ex.Message}";
            return Result.Failed;
        }

        string csvPath;
        try
        {
            csvPath = WriteCsv(document, summaries);
        }
        catch (Exception ex)
        {
            message = $"Schedules were created, but the BOQ CSV could not be written: {ex.Message}";
            TaskDialog.Show("FutolStructure BOQ", message);
            return Result.Succeeded;
        }

        var totalCount = summaries.Sum(summary => summary.Count);
        var totalVolume = summaries.Sum(summary => summary.VolumeM3);
        var report = new StringBuilder()
            .AppendLine("FutolStructure BOQ generated.")
            .AppendLine()
            .AppendLine($"FS members included: {totalCount.ToString(CultureInfo.InvariantCulture)}")
            .AppendLine($"Concrete volume: {totalVolume.ToString("0.###", CultureInfo.InvariantCulture)} m3")
            .AppendLine()
            .AppendLine("Schedules:");
        foreach (var scheduleName in scheduleNames) report.AppendLine($"- {scheduleName}");
        report.AppendLine().AppendLine($"CSV: {csvPath}");

        TaskDialog.Show("FutolStructure BOQ", report.ToString());
        return Result.Succeeded;
    }

    private static BoqSummary CollectSummary(Document document, BoqSpec spec)
    {
        var categoryId = new ElementId(spec.Category);
        var matchingElements = new FilteredElementCollector(document)
            .WhereElementIsNotElementType()
            .Where(element => element.Category is not null && element.Category.Id == categoryId)
            .Where(element => HasFutolStructureComment(element))
            .ToList();

        var volumeInternal = matchingElements.Sum(GetElementSolidVolume);
        var volumeM3 = UnitUtils.ConvertFromInternalUnits(volumeInternal, UnitTypeId.CubicMeters);
        return new BoqSummary(spec.Label, matchingElements.Count, volumeM3);
    }

    private static bool HasFutolStructureComment(Element element)
    {
        var comments = element.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.AsString();
        return !string.IsNullOrWhiteSpace(comments) &&
            comments.Contains(FsToken, StringComparison.OrdinalIgnoreCase);
    }

    private static double GetElementSolidVolume(Element element)
    {
        try
        {
            var geometry = element.get_Geometry(new Options
            {
                ComputeReferences = false,
                IncludeNonVisibleObjects = true,
                DetailLevel = ViewDetailLevel.Fine
            });
            return geometry is null ? 0 : GetGeometryVolume(geometry);
        }
        catch
        {
            // One malformed or unsupported proxy must not prevent the remaining BOQ
            // from being generated; the native schedule remains available for review.
            return 0;
        }
    }

    private static double GetGeometryVolume(GeometryElement geometry)
    {
        var volume = 0.0;
        foreach (var geometryObject in geometry)
        {
            switch (geometryObject)
            {
                case Solid solid when solid.Volume > 0:
                    volume += solid.Volume;
                    break;
                case GeometryInstance instance:
                    volume += GetGeometryVolume(instance.GetInstanceGeometry());
                    break;
                case GeometryElement nested:
                    volume += GetGeometryVolume(nested);
                    break;
            }
        }
        return volume;
    }

    private static ViewSchedule GetOrCreateSchedule(Document document, BoqSpec spec)
    {
        var existing = new FilteredElementCollector(document)
            .OfClass(typeof(ViewSchedule))
            .Cast<ViewSchedule>()
            .FirstOrDefault(schedule => string.Equals(schedule.Name, spec.ScheduleName,
                StringComparison.OrdinalIgnoreCase));

        return existing ?? ViewSchedule.CreateSchedule(document, new ElementId(spec.Category));
    }

    private static void ConfigureSchedule(Document document, ViewSchedule schedule, BoqSpec spec)
    {
        schedule.Name = spec.ScheduleName;
        var definition = schedule.Definition;
        definition.ClearFields();
        definition.ClearFilters();
        definition.ClearSortGroupFields();
        definition.IsItemized = false;

        var levelField = AddNamedField(document, definition, "Level", "Base Level", "Reference Level");
        var typeField = AddNamedField(document, definition, "Family and Type", "Type");
        var commentsField = AddNamedField(document, definition, "Comments");
        var volumeField = AddNamedField(document, definition, "Volume");
        var countField = definition.AddField(ScheduleFieldType.Count);

        if (levelField is not null) levelField.ColumnHeading = "Level";
        if (typeField is not null) typeField.ColumnHeading = "Family and Type";
        if (volumeField is not null) volumeField.ColumnHeading = "Concrete Volume";
        countField.ColumnHeading = "Count";

        if (commentsField is not null)
        {
            commentsField.IsHidden = true;
            definition.AddFilter(new ScheduleFilter(commentsField.FieldId,
                ScheduleFilterType.Contains, FsToken));
        }

        var sortFields = new List<ScheduleSortGroupField>();
        if (levelField is not null)
            sortFields.Add(new ScheduleSortGroupField(levelField.FieldId, ScheduleSortOrder.Ascending));
        if (typeField is not null)
            sortFields.Add(new ScheduleSortGroupField(typeField.FieldId, ScheduleSortOrder.Ascending));
        if (sortFields.Count > 0) definition.SetSortGroupFields(sortFields);
    }

    private static ScheduleField? AddNamedField(Document document, ScheduleDefinition definition,
        params string[] aliases)
    {
        var schedulable = definition.GetSchedulableFields()
            .FirstOrDefault(field => aliases.Any(alias =>
                field.GetName(document).Contains(alias, StringComparison.OrdinalIgnoreCase)));
        return schedulable is null ? null : definition.AddField(schedulable);
    }

    private static string WriteCsv(Document document, IReadOnlyCollection<BoqSummary> summaries)
    {
        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "FutolStructure", "BOQ");
        Directory.CreateDirectory(directory);

        var documentName = Path.GetFileNameWithoutExtension(document.PathName);
        if (string.IsNullOrWhiteSpace(documentName)) documentName = document.Title;
        documentName = SanitizeFileName(documentName);
        var path = Path.Combine(directory, $"{documentName}_FS_BOQ_{DateTime.Now:yyyyMMdd-HHmmss}.csv");

        var csv = new StringBuilder()
            .AppendLine("Category,Count,ConcreteVolume_m3");
        foreach (var summary in summaries)
        {
            csv.Append(Csv(summary.Category))
                .Append(',')
                .Append(summary.Count.ToString(CultureInfo.InvariantCulture))
                .Append(',')
                .AppendLine(summary.VolumeM3.ToString("0.###", CultureInfo.InvariantCulture));
        }

        csv.Append("TOTAL,")
            .Append(summaries.Sum(summary => summary.Count).ToString(CultureInfo.InvariantCulture))
            .Append(',')
            .AppendLine(summaries.Sum(summary => summary.VolumeM3).ToString("0.###", CultureInfo.InvariantCulture));
        File.WriteAllText(path, csv.ToString(), new UTF8Encoding(false));
        return path;
    }

    private static string Csv(string value) =>
        $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";

    private static string SanitizeFileName(string value)
    {
        foreach (var invalid in Path.GetInvalidFileNameChars()) value = value.Replace(invalid, '_');
        return string.IsNullOrWhiteSpace(value) ? "FutolStructure_Model" : value;
    }

    private sealed record BoqSpec(BuiltInCategory Category, string ScheduleName, string Label);
    private sealed record BoqSummary(string Category, int Count, double VolumeM3);
}
