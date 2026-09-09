const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const APP_ID = 'com.futoltech.futolstructure';
const RECENT_PROJECT_LIMIT = 10;
const PROJECT_EXTENSIONS = new Set(['.fstr', '.json']);
let mainWindow = null;
let manualUpdateCheck = false;
let updateDownloadStarted = false;
let initialProjectSent = false;
let etabsExportProcess = null;

function findProjectArgument(argv) {
  return argv
    .slice(1)
    .map((value) => (typeof value === 'string' ? value.replace(/^"|"$/g, '') : ''))
    .find((value) => /\.(fstr|json)$/i.test(value) && fs.existsSync(value)) || '';
}

const initialProjectPath = findProjectArgument(process.argv);

app.setAppUserModelId(APP_ID);

// Enable Chromium remote inspection only when explicitly requested by a local smoke test.
const remoteDebugPort = process.env.FS_ELECTRON_REMOTE_DEBUGGING_PORT;
if (/^\d+$/.test(remoteDebugPort || '')) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebugPort);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (!mainWindow) return;
    const projectPath = findProjectArgument(commandLine);
    if (projectPath) sendProjectToRenderer(projectPath);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function getWebRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'v3')
    : path.resolve(__dirname, '..', 'v3');
}

function getIconPath() {
  return path.join(getWebRoot(), 'assets', 'futolstructure-icon.png');
}

function normalizeProjectPath(projectPath, requireExisting = true) {
  if (typeof projectPath !== 'string' || !projectPath.trim() || projectPath.includes('\0')) return '';
  const resolved = path.resolve(projectPath.trim().replace(/^"|"$/g, ''));
  if (!PROJECT_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return '';
  if (!requireExisting) return resolved;
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return '';
    return fs.realpathSync.native(resolved);
  } catch (_error) {
    return '';
  }
}

function findRevit2027Executable() {
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramW6432'],
    process.env['ProgramFiles(x86)']
  ].filter(Boolean);
  const candidates = roots.map((root) => path.join(root, 'Autodesk', 'Revit 2027', 'Revit.exe'));
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function writeJsonAtomically(filePath, payload) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function getRecentProjectsStorePath() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

function writeRecentProjectRecords(records) {
  try {
    const storePath = getRecentProjectsStorePath();
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ version: 1, projects: records }, null, 2), 'utf8');
  } catch (error) {
    console.error('FutolStructure could not persist recent projects:', error);
  }
}

function readRecentProjectRecords() {
  let stored = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(getRecentProjectsStorePath(), 'utf8'));
    stored = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.projects) ? parsed.projects : []);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('FutolStructure could not read recent projects:', error);
    }
  }

  const seen = new Set();
  const records = [];
  for (const candidate of stored) {
    const candidatePath = typeof candidate === 'string' ? candidate : candidate?.path;
    const projectPath = normalizeProjectPath(candidatePath);
    if (!projectPath) continue;
    const key = process.platform === 'win32' ? projectPath.toLowerCase() : projectPath;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      path: projectPath,
      openedAt: typeof candidate?.openedAt === 'string' ? candidate.openedAt : ''
    });
    if (records.length >= RECENT_PROJECT_LIMIT) break;
  }

  const compactStored = stored.slice(0, RECENT_PROJECT_LIMIT).map((candidate) => ({
    path: typeof candidate === 'string' ? candidate : candidate?.path,
    openedAt: typeof candidate === 'string' ? '' : candidate?.openedAt
  }));
  if (JSON.stringify(records) !== JSON.stringify(compactStored)) writeRecentProjectRecords(records);
  return records;
}

function toPublicRecentProject(record) {
  return {
    path: record.path,
    name: path.basename(record.path),
    directory: path.dirname(record.path),
    openedAt: record.openedAt || ''
  };
}

function getRecentProjects() {
  return readRecentProjectRecords().map(toPublicRecentProject);
}

function rememberRecentProject(projectPath) {
  const normalizedPath = normalizeProjectPath(projectPath);
  if (!normalizedPath) return false;
  const key = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
  const records = readRecentProjectRecords().filter((record) => {
    const recordKey = process.platform === 'win32' ? record.path.toLowerCase() : record.path;
    return recordKey !== key;
  });
  records.unshift({ path: normalizedPath, openedAt: new Date().toISOString() });
  writeRecentProjectRecords(records.slice(0, RECENT_PROJECT_LIMIT));
  try {
    app.addRecentDocument(normalizedPath);
  } catch (_error) {
    // Windows jump-list history is best-effort; the governed in-app list remains authoritative.
  }
  if (app.isReady()) installMenu();
  return true;
}

function readProjectPayload(projectPath) {
  const normalizedPath = normalizeProjectPath(projectPath);
  if (!normalizedPath) throw new Error('The selected project is missing or is not an .fstr/.json file.');
  return {
    path: normalizedPath,
    name: path.basename(normalizedPath),
    text: fs.readFileSync(normalizedPath, 'utf8')
  };
}

async function chooseProjectFromDialog() {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'Open FutolStructure Project',
    properties: ['openFile'],
    filters: [
      { name: 'FutolStructure Projects', extensions: ['fstr', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readProjectPayload(result.filePaths[0]);
}

function safeReportFilename(value) {
  const cleaned = String(value || 'FutolStructure_Report.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const filename = cleaned || 'FutolStructure_Report.pdf';
  return filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
}

async function exportPdfReport(event, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return { success: false, message: 'PDF export request did not originate from the FutolStructure window.' };
  }
  const html = payload?.html;
  if (typeof html !== 'string' || html.length < 200 || html.length > 10_000_000 || !/<html[\s>]/i.test(html)) {
    return { success: false, message: 'The report HTML payload is missing or invalid.' };
  }

  const suggestedName = safeReportFilename(payload?.suggestedName);
  const testOutputPath = !app.isPackaged && process.env.FS_PDF_TEST_OUTPUT
    ? path.resolve(process.env.FS_PDF_TEST_OUTPUT)
    : '';
  const saveResult = testOutputPath
    ? { canceled: false, filePath: testOutputPath }
    : await dialog.showSaveDialog(mainWindow, {
      title: 'Save FutolStructure PDF Report',
      defaultPath: path.join(app.getPath('documents'), suggestedName),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });
  if (saveResult.canceled || !saveResult.filePath) return { success: false, canceled: true };

  const reportWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const tempPath = path.join(app.getPath('temp'), `futolstructure-report-${process.pid}-${Date.now()}.html`);
  try {
    await fs.promises.mkdir(path.dirname(saveResult.filePath), { recursive: true });
    await fs.promises.writeFile(tempPath, html, 'utf8');
    await reportWindow.loadFile(tempPath);
    await reportWindow.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
    const pdf = await reportWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false
    });
    await fs.promises.writeFile(saveResult.filePath, pdf);
    return { success: true, filePath: saveResult.filePath, bytes: pdf.length };
  } catch (error) {
    console.error('FutolStructure PDF export failed:', error);
    return { success: false, message: error.message };
  } finally {
    if (!reportWindow.isDestroyed()) reportWindow.destroy();
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#101722',
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('file://')) {
      return { action: 'allow' };
    }
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    if (initialProjectPath && !initialProjectSent) {
      initialProjectSent = true;
      sendProjectToRenderer(initialProjectPath);
    }
  });
  const indexPath = path.join(getWebRoot(), 'index.html');
  mainWindow.loadURL(pathToFileURL(indexPath).toString()).catch(async (error) => {
    console.error('FutolStructure primary file URL load failed:', error);
    try {
      await mainWindow.loadFile(indexPath);
    } catch (fallbackError) {
      dialog.showErrorBox('FutolStructure could not start', fallbackError.message);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendProjectToRenderer(projectPath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('desktop-open-project', readProjectPayload(projectPath));
  } catch (error) {
    dialog.showErrorBox('FutolStructure could not open the project', error.message);
    installMenu();
  }
}

function getPowerShellPath() {
  return path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
}

function parseEtabsEdbPath(output, outputDirectory) {
  const match = String(output || '').match(/ETABS model created:\s*(.+?)(?:\r?\n|$)/i);
  if (!match) return '';
  const value = match[1].trim().replace(/^"|"$/g, '');
  return path.isAbsolute(value) ? value : path.resolve(outputDirectory, value);
}

function parseEtabsArtifactPath(output, label, outputDirectory) {
  const escapedLabel = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(output || '').match(new RegExp(`${escapedLabel}\\s*:\\s*(.+?)(?:\\r?\\n|$)`, 'i'));
  if (!match) return '';
  const value = match[1].trim().replace(/^"|"$/g, '');
  return path.isAbsolute(value) ? value : path.resolve(outputDirectory, value);
}

function siblingEtabsArtifact(edbPath, suffix) {
  if (!edbPath) return '';
  const base = edbPath.replace(/\.edb$/i, '');
  const candidate = `${base}${suffix}`;
  return fs.existsSync(candidate) ? candidate : '';
}

function runPowerShellBuilder(scriptPath, outputDirectory) {
  if (etabsExportProcess) {
    throw new Error('An ETABS export is already running. Wait for it to finish before starting another export.');
  }

  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    getPowerShellPath(),
    ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    {
      cwd: outputDirectory,
      env: environment,
      windowsHide: false
    }
  );
  etabsExportProcess = child;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      if (etabsExportProcess === child) etabsExportProcess = null;
      resolve({ code, signal, stdout, stderr });
    };
    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      if (etabsExportProcess === child) etabsExportProcess = null;
      reject(error);
    });
    child.once('exit', (code, signal) => {
      // ETABS can inherit PowerShell's captured pipe handles and keep Node's
      // `close` event pending even though the builder has exited successfully.
      setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(code, signal);
      }, 250);
    });
    child.once('close', finish);
  });
}

async function findRecentEdb(outputDirectory, startedAt) {
  const entries = await fs.promises.readdir(outputDirectory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.edb')) continue;
    const filePath = path.join(outputDirectory, entry.name);
    const stat = await fs.promises.stat(filePath);
    if (stat.mtimeMs >= startedAt - 1000) candidates.push({ filePath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath || '';
}

function installMenu() {
  const recentProjects = getRecentProjects();
  const recentProjectItems = recentProjects.length
    ? recentProjects.map((project, index) => ({
        label: `${index + 1}. ${project.name.replace(/&/g, '&&')}`,
        sublabel: project.directory,
        click: () => sendProjectToRenderer(project.path)
      }))
    : [{ label: 'No Recent Projects', enabled: false }];
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            try {
              const payload = await chooseProjectFromDialog();
              if (payload && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('desktop-open-project', payload);
              }
            } catch (error) {
              dialog.showErrorBox('FutolStructure could not open the project', error.message);
            }
          }
        },
        { label: 'Open Recent', submenu: recentProjectItems },
        { type: 'separator' },
        { role: 'reload', label: 'Reload FutolStructure' },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'FutolStructure',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => checkForUpdates(true)
        },
        {
          label: 'Open Project Folder',
          click: () => shell.openPath(app.getPath('documents'))
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggledevtools', label: 'Developer Tools' },
        { role: 'resetzoom', label: 'Reset Zoom' },
        { role: 'zoomin', label: 'Zoom In' },
        { role: 'zoomout', label: 'Zoom Out' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showUpdateMessage(options) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve({ response: 1 });
  return dialog.showMessageBox(mainWindow, options);
}

async function checkForUpdates(manual = false) {
  manualUpdateCheck = manual;
  if (!app.isPackaged) {
    if (manual) {
      await showUpdateMessage({
        type: 'info',
        title: 'Updates are available after installation',
        message: 'Run this check from the installed FutolStructure application.'
      });
    }
    return { status: 'development' };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { status: 'checking' };
  } catch (error) {
    console.error('FutolStructure update check failed:', error);
    if (manual) {
      await showUpdateMessage({
        type: 'warning',
        title: 'Update check failed',
        message: 'The installed build could not reach the update service.',
        detail: error.message
      });
    }
    return { status: 'error', message: error.message };
  }
}

function installUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-available', async (info) => {
    if (updateDownloadStarted) return;
    const result = await showUpdateMessage({
      type: 'info',
      title: 'FutolStructure update available',
      message: `Version ${info.version} is ready to download.`,
      detail: 'Your saved .fstr project files are kept in your selected location.',
      buttons: ['Download and Install', 'Later'],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response !== 0) return;
    updateDownloadStarted = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      updateDownloadStarted = false;
      console.error('FutolStructure update download failed:', error);
      await showUpdateMessage({
        type: 'warning',
        title: 'Update download failed',
        message: error.message
      });
    }
  });

  autoUpdater.on('update-not-available', async () => {
    if (!manualUpdateCheck) return;
    await showUpdateMessage({
      type: 'info',
      title: 'FutolStructure is up to date',
      message: `Version ${app.getVersion()} is the current published desktop build.`
    });
  });

  autoUpdater.on('update-downloaded', async () => {
    const result = await showUpdateMessage({
      type: 'info',
      title: 'FutolStructure update downloaded',
      message: 'Restart the application to install the update now.',
      buttons: ['Restart and Install', 'Later'],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response === 0) autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', (error) => {
    updateDownloadStarted = false;
    console.error('FutolStructure updater error:', error);
  });
}

ipcMain.handle('desktop-info', () => ({
  appVersion: app.getVersion(),
  packaged: app.isPackaged,
  updateChannel: 'github-releases'
}));

ipcMain.handle('check-for-updates', () => checkForUpdates(true));

ipcMain.handle('get-recent-projects', () => getRecentProjects());

ipcMain.handle('open-project-dialog', async () => chooseProjectFromDialog());

ipcMain.handle('open-recent-project', (_event, projectPath) => {
  const normalizedPath = normalizeProjectPath(projectPath);
  const requestedKey = process.platform === 'win32'
    ? normalizedPath.toLowerCase()
    : normalizedPath;
  const isRemembered = normalizedPath && readRecentProjectRecords().some((record) => {
    const recordKey = process.platform === 'win32' ? record.path.toLowerCase() : record.path;
    return recordKey === requestedKey;
  });
  if (!isRemembered) throw new Error('This project is no longer in the Recent Projects history.');
  return readProjectPayload(normalizedPath);
});

ipcMain.handle('remember-project', (_event, projectPath) => rememberRecentProject(projectPath));

ipcMain.handle('export-pdf-report', exportPdfReport);

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !url.startsWith('https://')) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('run-etabs-export', async (_event, payload) => {
  const script = payload?.script;
  if (
    typeof script !== 'string' ||
    script.length < 1000 ||
    !script.includes('ETABSv1.Helper') ||
    !script.includes('Save EDB')
  ) {
    return { success: false, message: 'The ETABS builder payload is incomplete or invalid.' };
  }

  const outputDirectory = path.join(app.getPath('documents'), 'FutolStructure ETABS Exports');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\.\d{3}Z$/, 'Z');
  const scriptPath = path.join(outputDirectory, `FutolStructure_ETABS_Builder_${stamp}.ps1`);
  const startedAt = Date.now();

  try {
    await fs.promises.mkdir(outputDirectory, { recursive: true });
    await fs.promises.writeFile(scriptPath, script, 'utf8');
    const result = await runPowerShellBuilder(scriptPath, outputDirectory);
    const edbPath = parseEtabsEdbPath(result.stdout, outputDirectory) ||
      await findRecentEdb(outputDirectory, startedAt);
    const e2kPath = parseEtabsArtifactPath(result.stdout, 'Native E2K created', outputDirectory) ||
      siblingEtabsArtifact(edbPath, '.e2k');
    const auditPath = parseEtabsArtifactPath(result.stdout, 'Audit created', outputDirectory) ||
      siblingEtabsArtifact(edbPath, '_audit.json');
    const modalParticipationCsvPath = parseEtabsArtifactPath(result.stdout, 'Modal participation CSV created', outputDirectory) ||
      siblingEtabsArtifact(edbPath, '_modal_participation.csv');
    const edbExists = !!edbPath && fs.existsSync(edbPath);
    const success = result.code === 0 && edbExists;
    return {
      success,
      code: result.code,
      signal: result.signal,
      scriptPath,
      outputDirectory,
      edbPath,
      e2kPath,
      auditPath,
      modalParticipationCsvPath,
      etabsSessionStarted: success,
      message: success
        ? 'ETABS created the dated .edb and left the generated model open.'
        : `ETABS builder did not produce a usable .edb (exit code ${result.code ?? 'unknown'}).`,
      stdout: result.stdout.slice(-6000),
      stderr: result.stderr.slice(-6000)
    };
  } catch (error) {
    console.error('FutolStructure ETABS desktop export failed:', error);
    return {
      success: false,
      scriptPath,
      outputDirectory,
      message: error.message,
      stderr: String(error.stack || error.message).slice(-6000)
    };
  }
});

ipcMain.handle('run-revit-import', async (_event, payload) => {
  const manifest = payload?.manifest;
  if (!manifest || manifest.contract !== 'FutolStructure.RevitNativeImport.v1') {
    return { success: false, message: 'The Revit manifest contract is missing or unsupported.' };
  }

  const revitExecutable = findRevit2027Executable();
  if (!revitExecutable) {
    return { success: false, message: 'Revit 2027 was not found in the standard Autodesk installation path.' };
  }
  const outputDirectory = path.join(app.getPath('documents'), 'FutolStructure Revit Imports');
  const jobDirectory = path.join(app.getPath('documents'), 'FutolStructure', 'Revit Jobs');
  const hostDirectory = path.join(app.getPath('documents'), 'FutolStructure', 'Revit Hosts');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').replace(/\.\d{3}Z$/, 'Z');
  const manifestPath = path.join(outputDirectory, `FutolStructure_Revit_Import_${stamp}.json`);
  const jobPath = path.join(jobDirectory, 'pending-revit-import.json');
  // Version the private host so a stale .rte copied to .rvt from an older build
  // can never be reused by the corrected API-created host workflow.
  const hostPath = path.join(hostDirectory, 'FutolStructure_Revit_Import_Host_FS125.rvt');
  const jobId = `revit-${stamp}-${process.pid}`;

  try {
    await fs.promises.mkdir(outputDirectory, { recursive: true });
    await fs.promises.mkdir(jobDirectory, { recursive: true });
    await fs.promises.mkdir(hostDirectory, { recursive: true });
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const hostExists = fs.existsSync(hostPath);
    writeJsonAtomically(jobPath, {
      contract: 'FutolStructure.RevitImportJob.v1',
      jobId,
      createdAt: new Date().toISOString(),
      manifestPath,
      hostPath
    });

    const child = spawn(revitExecutable, hostExists ? [hostPath] : [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return {
      success: true,
      jobId,
      manifestPath,
      hostPath,
      jobPath,
      revitExecutable,
      hostCreatedByRevitApi: !hostExists,
      message: hostExists
        ? 'Revit 2027 was launched with the FutolStructure FS125 host. The installed FutolStructure startup add-in will post the import command automatically.'
        : 'Revit 2027 was launched for the queued job. The installed FutolStructure startup add-in will create a valid metric .rvt host through the Revit API, open it, and import automatically.'
    };
  } catch (error) {
    return {
      success: false,
      manifestPath,
      jobPath,
      message: `Revit automation job could not be started: ${error.message}`
    };
  }
});

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    installMenu();
    if (app.isPackaged) installUpdater();
    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!hasSingleInstanceLock) return;
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
