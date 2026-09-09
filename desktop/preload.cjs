const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('FutolStructureDesktop', Object.freeze({
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('desktop-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  openRecentProject: (projectPath) => ipcRenderer.invoke('open-recent-project', projectPath),
  rememberProject: (projectPath) => ipcRenderer.invoke('remember-project', projectPath),
  saveProjectFile: (payload) => ipcRenderer.invoke('save-project-file', payload),
  exportPdfReport: (payload) => ipcRenderer.invoke('export-pdf-report', payload),
  runEtabsBuilder: (payload) => ipcRenderer.invoke('run-etabs-export', payload),
  runRevitImport: (payload) => ipcRenderer.invoke('run-revit-import', payload),
  onProjectOpen: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-open-project', listener);
    return () => ipcRenderer.removeListener('desktop-open-project', listener);
  }
}));
