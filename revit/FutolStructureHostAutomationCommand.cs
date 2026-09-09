using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FutolStructure.Revit2027;

[Transaction(TransactionMode.Manual)]
public sealed class FutolStructureHostAutomationCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var pendingJobPath = RevitAutomationPaths.PendingJobPath;
        if (!FutolStructureStartup.TryReadJob(pendingJobPath, out _, out var hostPath,
            out var jobId, out var error))
        {
            message = error;
            return Result.Failed;
        }

        if (File.Exists(hostPath))
        {
            try
            {
                commandData.Application.OpenAndActivateDocument(hostPath);
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = $"The existing FutolStructure host could not be opened: {ex.Message}";
                FutolStructureStartup.CompleteJob(pendingJobPath, "failed", jobId, message);
                return Result.Failed;
            }
        }

        Document? host = null;
        try
        {
            var directory = Path.GetDirectoryName(hostPath);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);

            host = commandData.Application.Application.NewProjectDocument(UnitSystem.Metric);
            host.SaveAs(hostPath);
            host.Close(false);
            host = null;

            commandData.Application.OpenAndActivateDocument(hostPath);
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            try { host?.Close(false); } catch { }
            message = $"A valid FutolStructure Revit host could not be created: {ex.Message}";
            FutolStructureStartup.CompleteJob(pendingJobPath, "failed", jobId, message);
            return Result.Failed;
        }
    }
}
