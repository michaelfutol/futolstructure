using System.IO;
using System.Reflection;
using System.Text.Json;
using Autodesk.Revit.UI;

namespace FutolStructure.Revit2027;

public sealed class FutolStructureStartup : IExternalApplication
{
    private const string ImportCommandId =
        "7e17f4af-6c55-4a17-a77c-b0cc0b2d7a27:FutolStructure.Revit2027.FutolStructureCommand";
    private const string HostAutomationCommandId =
        "b458d5b5-a9d2-41b4-b8e7-1bfe5de3a8f0:FutolStructure.Revit2027.FutolStructureHostAutomationCommand";
    private static DateTime _lastPostUtc = DateTime.MinValue;

    public Result OnStartup(UIControlledApplication application)
    {
        application.Idling += OnIdling;
        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication application)
    {
        application.Idling -= OnIdling;
        return Result.Succeeded;
    }

    private static void OnIdling(object? sender, Autodesk.Revit.UI.Events.IdlingEventArgs args)
    {
        if (sender is not UIControlledApplication application ||
            (DateTime.UtcNow - _lastPostUtc).TotalSeconds < 2)
            return;

        var jobPath = RevitAutomationPaths.PendingJobPath;
        if (!File.Exists(jobPath)) return;

        if (!TryReadJob(jobPath, out var manifestPath, out var hostPath, out var jobId, out var error))
        {
            CompleteJob(jobPath, "invalid", jobId, error);
            TaskDialog.Show("FutolStructure Revit automation", error);
            return;
        }

        if (!File.Exists(manifestPath))
        {
            var missing = $"The queued FutolStructure manifest was not found:\n\n{manifestPath}";
            CompleteJob(jobPath, "failed", jobId, missing);
            TaskDialog.Show("FutolStructure Revit automation", missing);
            return;
        }

        var commandId = RevitCommandId.LookupCommandId(ImportCommandId);
        if (commandId is null)
        {
            var missingCommand = "The FutolStructure Revit import command could not be registered.";
            CompleteJob(jobPath, "failed", jobId, missingCommand);
            TaskDialog.Show("FutolStructure Revit automation", missingCommand);
            return;
        }

        try
        {
            var uiApplication = CreateUIApplication(application);
            if (uiApplication is null) return;

            if (!File.Exists(hostPath))
            {
                var hostCommandId = RevitCommandId.LookupCommandId(HostAutomationCommandId);
                if (hostCommandId is null)
                {
                    var missingHostCommand = "The FutolStructure Revit host-creation command could not be registered.";
                    CompleteJob(jobPath, "failed", jobId, missingHostCommand);
                    TaskDialog.Show("FutolStructure Revit automation", missingHostCommand);
                    return;
                }

                if (!uiApplication.CanPostCommand(hostCommandId)) return;
                uiApplication.PostCommand(hostCommandId);
                _lastPostUtc = DateTime.UtcNow;
                return;
            }

            var activePath = uiApplication.ActiveUIDocument?.Document?.PathName;
            if (string.IsNullOrWhiteSpace(activePath) || !PathsEqual(activePath, hostPath))
            {
                if (!TryOpenAndActivateDocument(application, hostPath, out var openError))
                {
                    string backupPath = string.Empty;
                    string quarantineError = string.Empty;
                    if (!IsManagedHostPath(hostPath) || !TryQuarantineInvalidHost(hostPath, out backupPath, out quarantineError))
                    {
                        var failure = string.IsNullOrWhiteSpace(quarantineError)
                            ? openError
                            : $"{openError}\n\nThe invalid managed host could not be quarantined: {quarantineError}";
                        CompleteJob(jobPath, "failed", jobId, failure);
                        TaskDialog.Show("FutolStructure Revit automation", failure);
                        return;
                    }

                    var hostCommandId = RevitCommandId.LookupCommandId(HostAutomationCommandId);
                    if (hostCommandId is null || !uiApplication.CanPostCommand(hostCommandId))
                    {
                        var failure = $"The existing FutolStructure host was invalid and was moved to:\n\n{backupPath}\n\nThe automated host-creation command is not currently available.";
                        CompleteJob(jobPath, "failed", jobId, failure);
                        TaskDialog.Show("FutolStructure Revit automation", failure);
                        return;
                    }

                    uiApplication.PostCommand(hostCommandId);
                    _lastPostUtc = DateTime.UtcNow;
                    return;
                }

                _lastPostUtc = DateTime.UtcNow;
                return;
            }

            if (!uiApplication.CanPostCommand(commandId)) return;
            uiApplication.PostCommand(commandId);
            _lastPostUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            // Revit can reject a post while another command is still running. Leave the
            // job queued so the next idle cycle can retry without losing the manifest.
            if (!ex.Message.Contains("already been posted", StringComparison.OrdinalIgnoreCase))
            {
                CompleteJob(jobPath, "failed", jobId, ex.Message);
                TaskDialog.Show("FutolStructure Revit automation", ex.Message);
            }
        }
    }

    private static UIApplication? CreateUIApplication(UIControlledApplication application)
    {
        var databaseApplication = (Autodesk.Revit.ApplicationServices.Application?)Activator.CreateInstance(
            typeof(Autodesk.Revit.ApplicationServices.Application),
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            args: new object[] { application.ControlledApplication },
            culture: null);
        return databaseApplication is null ? null : new UIApplication(databaseApplication);
    }

    private static bool TryOpenAndActivateDocument(UIControlledApplication application, string hostPath,
        out string error)
    {
        error = string.Empty;
        var openMethod = application.GetType().GetMethod(
            "OpenAndActivateDocument",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
        if (openMethod is null)
        {
            error = "Revit 2027 did not expose the document-open automation method.";
            return false;
        }

        try
        {
            openMethod.Invoke(application, new object[] { hostPath });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool IsManagedHostPath(string hostPath) =>
        PathsEqual(Path.GetDirectoryName(hostPath) ?? string.Empty, RevitAutomationPaths.HostDirectory);

    private static bool TryQuarantineInvalidHost(string hostPath, out string backupPath, out string error)
    {
        backupPath = string.Empty;
        error = string.Empty;
        try
        {
            var stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            backupPath = $"{hostPath}.invalid-{stamp}.bak";
            File.Move(hostPath, backupPath);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    internal static bool TryReadJob(string jobPath, out string manifestPath, out string hostPath,
        out string jobId, out string error)
    {
        manifestPath = string.Empty;
        hostPath = string.Empty;
        jobId = string.Empty;
        error = string.Empty;
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(jobPath));
            var root = document.RootElement;
            if (root.GetProperty("contract").GetString() != "FutolStructure.RevitImportJob.v1")
            {
                error = "The queued Revit automation job contract is unsupported.";
                return false;
            }

            jobId = root.TryGetProperty("jobId", out var id) ? id.GetString() ?? string.Empty : string.Empty;
            manifestPath = NormalizePath(root, "manifestPath", ".json");
            hostPath = NormalizePath(root, "hostPath", ".rvt");
            if (string.IsNullOrWhiteSpace(manifestPath) || string.IsNullOrWhiteSpace(hostPath))
            {
                error = "The queued Revit automation job has invalid manifest or host paths.";
                return false;
            }
            return true;
        }
        catch (Exception ex)
        {
            error = $"The queued Revit automation job could not be read: {ex.Message}";
            return false;
        }
    }

    private static string NormalizePath(JsonElement root, string propertyName, string extension)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String)
            return string.Empty;
        var path = Path.GetFullPath(value.GetString() ?? string.Empty);
        return string.Equals(Path.GetExtension(path), extension, StringComparison.OrdinalIgnoreCase)
            ? path
            : string.Empty;
    }

    internal static void CompleteJob(string jobPath, string status, string jobId, string message)
    {
        try
        {
            var directory = Path.GetDirectoryName(jobPath) ?? Environment.CurrentDirectory;
            var stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
            var completedPath = Path.Combine(directory, $"revit-import-{status}-{stamp}.json");
            var result = new
            {
                contract = "FutolStructure.RevitImportJobResult.v1",
                jobId,
                status,
                completedAt = DateTimeOffset.UtcNow,
                message
            };
            File.WriteAllText(completedPath, JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
            File.Delete(jobPath);
        }
        catch
        {
            // A completed import must not be rolled back just because the job receipt cannot be written.
        }
    }

    internal static bool PathsEqual(string left, string right) =>
        string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);
}

internal static class RevitAutomationPaths
{
    public static string RootDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FutolStructure");

    public static string PendingJobPath => Path.Combine(RootDirectory, "Revit Jobs", "pending-revit-import.json");
    public static string HostDirectory => Path.Combine(RootDirectory, "Revit Hosts");
}
