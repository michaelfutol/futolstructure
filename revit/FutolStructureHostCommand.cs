using System.IO;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Microsoft.Win32;

namespace FutolStructure.Revit2027;

[Transaction(TransactionMode.Manual)]
public sealed class FutolStructureHostCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        var defaultDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "FutolStructure",
            "Revit Hosts");
        Directory.CreateDirectory(defaultDirectory);

        var dialog = new SaveFileDialog
        {
            Title = "Create FutolStructure Revit import host",
            Filter = "Revit project (*.rvt)|*.rvt",
            InitialDirectory = defaultDirectory,
            FileName = "FutolStructure_Revit_Import_Host.rvt",
            AddExtension = true,
            OverwritePrompt = true,
            CheckPathExists = true
        };
        if (dialog.ShowDialog() != true) return Result.Cancelled;

        Document? host = null;
        try
        {
            host = commandData.Application.Application.NewProjectDocument(UnitSystem.Metric);
            host.SaveAs(dialog.FileName);
            host.Close(false);
            host = null;

            commandData.Application.OpenAndActivateDocument(dialog.FileName);
            TaskDialog.Show(
                "FutolStructure Revit Import Host",
                $"Created a clean metric Revit host project:\n\n{dialog.FileName}\n\n" +
                "Use Add-Ins > External Tools > FutolStructure Revit 2027 to select any " +
                "FutolStructure Revit import manifest. The host contains no project-specific " +
                "architectural geometry.");
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            try { host?.Close(false); } catch { }
            message = $"FutolStructure import host could not be created: {ex.Message}";
            return Result.Failed;
        }
    }
}
