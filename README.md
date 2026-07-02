# FutolStructure v3.10

> Professional structural engineering web application for reinforced concrete buildings with tributary area analysis, 3D visualization, and load distribution calculations.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-3.10-green.svg)
![Platform](https://img.shields.io/badge/platform-Web-orange.svg)

## 🏗️ Features

### Core Analysis
- **Two-way slab tributary distribution** (45° rule with trapezoidal/triangular loads)
- **Complete load path:** Slab → Beams → Columns → Footings
- **Multi-floor stacking** with per-floor configurations
- **Factored load calculations** (NSCP/ACI 318 compliant)

### 3D Visualization
- Full **3D BIM-style view** with Three.js
- Color-coded members (columns, beams, slabs, footings)
- **Member labels** (C1-A1, B-X-A1, etc.)
- **Ground plane with gridline bubbles**
- Interactive orbit controls

### Engineering Tools
- **Footing design** with soil bearing capacity
- **Tie beam sizing** (span/10 rule)
- **Column sizing** (NSCP minimum requirements)
- Per-floor cantilever support
- Custom beam placement
- Void slab toggles

### User Experience
- **Undo/Redo** (Ctrl+Z / Ctrl+Y) - 10 command history
- Dark/Light theme support
- Export to JSON
- Keyboard shortcuts
- Responsive design

## 🚀 Quick Start

1. Clone or download this repository
2. Open `v3/index.html` in any modern browser
3. No build step required - works offline!

```bash
git clone https://github.com/michaelfutol/FutolStructure.git
cd FutolStructure
# Open v3/index.html in browser
```

## 📁 Project Structure

```
FutolStructure/
├── v3/
│   ├── index.html      # Main application (single-file)
│   ├── _logs/          # Development logs
│   └── _archive/       # Previous versions
├── README.md
└── .gitignore
```

## 🛠️ Tech Stack

- **Frontend:** Pure HTML/CSS/JavaScript
- **3D Engine:** Three.js (CDN)
- **Dependencies:** None (works offline)
- **Size:** ~565KB single file

## ✅ Local Checks

Run the recovery smoke check before and after geometry/rendering changes:

```bash
node v3/tools/check-fs.js
```

Syntax-only mode:

```bash
node v3/tools/check-fs.js --no-browser
```

The full smoke check parses the inline app scripts, checks engine syntax, opens the app through Chrome/Edge CDP, verifies default and 4x3 model initialization, checks column/slab counts, confirms cantilever input panels follow the active grid after undo/redo, legacy `.fstr` root-cantilever loads, and browser reload autosave restore, confirms column/beam/slab delete undo recovery, confirms void slabs are not drawn as red ghosts in normal canvas view, confirms plain slab left-click does not delete slabs, and verifies hidden geometry from loaded `.fstr` files is quarantined.

## 📋 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Scroll` | Zoom |
| `Drag` | Pan (in 2D view) |

## 🎯 Roadmap

- [ ] Rebar calculation for footings
- [ ] Punching shear checks for flat slabs
- [ ] Export to AutoCAD DXF
- [ ] PDF report generation

## 📄 License

MIT License - Free to use for personal and commercial projects.

## 👨‍💻 Author

**FutolTech** - Engineering & Project Systems

---

*Built with ❤️ for structural engineers*
