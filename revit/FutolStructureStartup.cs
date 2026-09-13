using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace FutolStructure.Revit2027;

public sealed class FutolStructureStartup : IExternalApplication
{
    private const string ImportCommandId =
        "7e17f4af-6c55-4a17-a77c-b0cc0b2d7a27";
    private static DateTime _lastPostUtc = DateTime.MinValue;
    private static UIControlledApplication? _application;

    public Result OnStartup(UIControlledApplication application)
    {
        _application = application;
        application.Idling += OnIdling;
        return Result.Succeeded;
    }

    public Result OnShutdown(UIControlledApplication application)
    {
        application.Idling -= OnIdling;
        _application = null;
        return Result.Succeeded;
    }

    private static void OnIdling(object? sender, Autodesk.Revit.UI.Events.IdlingEventArgs args)
    {
        var application = _application;
        if (application is null ||
            (DateTime.UtcNow - _lastPostUtc).TotalSeconds < 2)
            return;

        var jobPath = RevitAutomationPaths.PendingJobPath;
        if (!File.Exists(jobPath)) return;

        Log("Idling found queued import job.");

        if (!TryReadJob(jobPath, out var manifestPath, out var hostPath, out var jobId, out var error))
        {
            Log($"Job read failed: {error}");
            CompleteJob(jobPath, "invalid", jobId, error);
            TaskDialog.Show("FutolStructure Revit automation", error);
            return;
        }

        Log($"Job {jobId}: manifest={manifestPath}; host={hostPath}");

        if (!File.Exists(manifestPath))
        {
            var missing = $"The queued FutolStructure manifest was not found:\n\n{manifestPath}";
            Log(missing);
            CompleteJob(jobPath, "failed", jobId, missing);
            TaskDialog.Show("FutolStructure Revit automation", missing);
            return;
        }

        // Revit identifies external commands by the AddInId from the manifest.
        // The full class name suffix is not a valid LookupCommandId key.
        var commandId = RevitCommandId.LookupCommandId(ImportCommandId);
        if (commandId is null)
        {
            Log($"LookupCommandId returned null for {ImportCommandId}.");
            // Keep the job queued. Revit can finish ribbon registration after the
            // first idle cycle, and the next cycle can retry without losing it.
            _lastPostUtc = DateTime.UtcNow;
            return;
        }

        try
        {
            var uiApplication = CreateUIApplication(application);
            if (uiApplication is null)
            {
                Log("UIApplication creation returned null.");
                _lastPostUtc = DateTime.UtcNow;
                return;
            }

            // A user-opened blank host is a controlled fallback for Revit Home/security
            // states where the startup-created host cannot be opened automatically.
            var activePath = uiApplication.ActiveUIDocument?.Document?.PathName;
            Log($"Active document: {activePath ?? "<none>"}");
            if (WaitForActiveDocumentFallback(jobPath) &&
                (string.IsNullOrWhiteSpace(activePath) ||
                 !File.Exists(activePath) ||
                 !IsManagedHostPath(activePath)))
            {
                _lastPostUtc = DateTime.UtcNow;
                return;
            }

            if (AllowsActiveDocumentFallback(jobPath) &&
                !string.IsNullOrWhiteSpace(activePath) &&
                File.Exists(activePath) &&
                IsManagedHostPath(activePath))
            {
                if (!PathsEqual(activePath, hostPath) && !TryRetargetJobHost(jobPath, activePath))
                    return;
                hostPath = activePath;
            }

            if (!File.Exists(hostPath))
            {
                Log($"Host does not exist; attempting creation: {hostPath}");
                if (!TryCreateAndActivateHost(application, hostPath, out var hostError))
                {
                    Log($"Host creation failed: {hostError}");
                    CompleteJob(jobPath, "failed", jobId, hostError);
                    TaskDialog.Show("FutolStructure Revit automation", hostError);
                    return;
                }

                _lastPostUtc = DateTime.UtcNow;
                return;
            }

            activePath = uiApplication.ActiveUIDocument?.Document?.PathName;
            if (string.IsNullOrWhiteSpace(activePath) || !PathsEqual(activePath, hostPath))
            {
                Log($"Opening/activating host because active document does not match: {hostPath}");
                if (!TryOpenAndActivateDocument(application, hostPath, out var openError))
                {
                    Log($"Host open failed: {openError}");
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

                    if (!TryCreateAndActivateHost(application, hostPath, out var hostError))
                    {
                        var failure = $"The existing FutolStructure host was invalid and was moved to:\n\n{backupPath}\n\n{hostError}";
                        CompleteJob(jobPath, "failed", jobId, failure);
                        TaskDialog.Show("FutolStructure Revit automation", failure);
                        return;
                    }

                    _lastPostUtc = DateTime.UtcNow;
                    return;
                }

                _lastPostUtc = DateTime.UtcNow;
                return;
            }

            if (!uiApplication.CanPostCommand(commandId))
            {
                Log($"CanPostCommand returned false for {ImportCommandId}.");
                _lastPostUtc = DateTime.UtcNow;
                return;
            }
            uiApplication.PostCommand(commandId);
            Log($"Posted import command {ImportCommandId}.");
            _lastPostUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            Log($"Idling exception: {ex}");
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
        // Revit owns the UIApplication bridge. Revit 2027 exposes it internally
        // from UIControlledApplication, while its public constructors require a
        // database Application that is not exposed by the startup callback.
        var getter = application.GetType().GetMethod(
            "getUIApplication",
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        return getter?.Invoke(application, null) as UIApplication;
    }

    private static Autodesk.Revit.ApplicationServices.Application? CreateDatabaseApplication(
        UIControlledApplication application)
    {
        return CreateUIApplication(application)?.Application;
    }

    private static bool TryCreateAndActivateHost(UIControlledApplication application, string hostPath,
        out string error)
    {
        error = string.Empty;
        Autodesk.Revit.ApplicationServices.Application? databaseApplication = null;
        Document? host = null;
        try
        {
            databaseApplication = CreateDatabaseApplication(application);
            var directory = Path.GetDirectoryName(hostPath);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);

            if (databaseApplication is null)
            {
                error = "Revit did not expose its database application for host creation.";
                return false;
            }

            host = databaseApplication.NewProjectDocument(UnitSystem.Metric);
            host.SaveAs(hostPath);
            host.Close(false);
            host = null;

            if (!TryOpenAndActivateDocument(application, hostPath, out error)) return false;
            return true;
        }
        catch (Exception ex)
        {
            try { host?.Close(false); } catch { }
            error = ex.Message;
            return false;
        }
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
        PathsEqual(Path.GetDirectoryName(hostPath) ?? string.Empty, RevitAutomationPaths.HostDirectory) &&
        string.Equals(Path.GetExtension(hostPath), ".rvt", StringComparison.OrdinalIgnoreCase);

    private static bool AllowsActiveDocumentFallback(string jobPath)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(jobPath));
            return document.RootElement.TryGetProperty("allowActiveDocumentFallback", out var value) &&
                value.ValueKind == JsonValueKind.True;
        }
        catch
        {
            return false;
        }
    }

    private static bool WaitForActiveDocumentFallback(string jobPath)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(jobPath));
            return document.RootElement.TryGetProperty("waitForActiveDocumentFallback", out var value) &&
                value.ValueKind == JsonValueKind.True;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryRetargetJobHost(string jobPath, string hostPath)
    {
        try
        {
            var root = JsonNode.Parse(File.ReadAllText(jobPath)) as JsonObject;
            if (root is null) return false;
            root["hostPath"] = Path.GetFullPath(hostPath);
            var tempPath = $"{jobPath}.tmp-{Environment.ProcessId}";
            File.WriteAllText(tempPath, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            File.Move(tempPath, jobPath, overwrite: true);
            return true;
        }
        catch
        {
            return false;
        }
    }

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

    private static void Log(string message)
    {
        try
        {
            var directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                "FutolStructure", "Revit Jobs");
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, "revit-startup.log");
            File.AppendAllText(path, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
        }
        catch
        {
            // Diagnostics must never interfere with Revit startup.
        }
    }
}

internal static class RevitAutomationPaths
{
    public static string RootDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FutolStructure");

    public static string PendingJobPath => Path.Combine(RootDirectory, "Revit Jobs", "pending-revit-import.json");
    public static string HostDirectory => Path.Combine(RootDirectory, "Revit Hosts");
}
