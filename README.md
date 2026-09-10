# Git Project Explorer (Multi-Repo Manager para Visual Studio Code)

Una extensión para **Visual Studio Code** diseñada para desarrolladores y equipos que trabajan con múltiples repositorios de Git dentro de un mismo espacio de trabajo (*multi-repo workspaces*).

Proporciona un nuevo contenedor en la barra lateral izquierda con tres secciones integradas:
1. **Explorer**: Árbol independiente para cada proyecto Git con navegación completa de carpetas y apertura de archivos.
2. **Commands**: Comandos Git predefinidos para ejecutar en lote sobre todos los repositorios simultáneamente (`Pull`, `Push`, `Fetch`, `Status`, `Checkout`, `Stash`).
3. **CLI**: Terminal interactiva y ejecutor de comandos arbitrarios con selección de repositorios, historial y visor de logs.

---

## Características

### 1. Detección Automática de Repositorios (Estilo Source Control)
- Escanea automáticamente la carpeta actual o espacio de trabajo en busca de repositorios `.git`.
- Ignora inteligentemente carpetas pesadas como `node_modules`, `dist`, `.cache`, `target`, etc.
- Se integra con la API nativa de Git de VS Code cuando está activa.
- Muestra en tiempo real la rama activa, si hay cambios pendientes (*dirty status*) y el conteo de commits por subir o bajar (*ahead / behind*).

### 2. Sección Explorer
- Cada repositorio aparece como un nodo raíz independiente en el árbol.
- Al expandir un repositorio, navega por su jerarquía de carpetas y archivos.
- Al hacer clic en cualquier archivo, se abre inmediatamente en el editor de VS Code.
- **Acción "Show Only Uncommitted" (en la barra de título del Explorer)**:
  - Junto a *Refresh* y *Show Output Log*.
  - Al activarla, filtra la vista para mostrar **únicamente** los repositorios con cambios sin commit y, dentro de ellos, **únicamente** los archivos modificados/sin seguimiento.
  - Al desactivarla, vuelve a mostrar todos los repositorios y archivos.
- **Acción "Show Only Uncommitted" por repositorio**:
  - Cada repositorio tiene su propio botón de filtro inline `$(filter)` para alternar la vista de solo cambios de manera individual.
- Opciones de menú contextual para:
  - **Abrir terminal integrada en la raíz del repositorio**.
  - **Revelar archivo o carpeta en el explorador del sistema operativo** (Finder / Explorer).

### 3. Sección Commands
Acciones rápidas sobre **todos** los repositorios con barra de progreso y resumen de resultados:
- 🔄 **Fetch All**: `git fetch --all --prune`
- ⬇️ **Pull All (Current Branch)**: `git pull` en la rama activa de cada repositorio.
- 🌟 **Pull from Main/Master**: Detecta la rama por defecto (`main`, `master`, `develop`) y hace pull en todos los repositorios.
- ⬆️ **Push All**: `git push` en todos los repositorios con diálogo de confirmación de seguridad.
- 📊 **Status Summary**: Resumen consolidado del estado de cambios en el espacio de trabajo.
- 🌿 **Checkout / Switch Branch**: Solicita el nombre de una rama y cambia a ella en todos los repositorios.
- 💾 **Stash All**: Guarda temporalmente cambios sin confirmar en todos los repositorios.
- 📦 **Stash Pop All**: Restaura los cambios guardados en el stash.

### 4. Sección CLI
- Permite ingresar cualquier comando de terminal o Git (ejemplo: `git status -s`, `git branch -a`, `git log -1`, `npm test`).
- Selector con casillas de verificación para ejecutar en todos los repositorios o solo en los seleccionados.
- Chips con atajos a comandos frecuentes.
- Historial de comandos recientes.
- Consola integrada con salida en vivo de `stdout` y `stderr` etiquetada por repositorio.

---

## Cómo Probar y Ejecutar la Extensión

### Requisitos
- [Node.js](https://nodejs.org/) (v18 o superior)
- [pnpm](https://pnpm.io/) (v9 o v10) o npm
- [Visual Studio Code](https://code.visualstudio.com/)

### Pasos:

1. **Instalar dependencias**:
   ```bash
   pnpm install
   ```

2. **Compilar el proyecto**:
   ```bash
   pnpm run compile
   ```
   *(O dejar `pnpm run watch` corriendo en segundo plano)*

3. **Ejecutar en VS Code**:
   - Abre la carpeta `multi-repo-manager` en VS Code.
   - Presiona **F5** (o ve al panel *Run & Debug* y selecciona **"Run Extension (F5)"**).
   - Se abrirá una nueva ventana de VS Code (*[Extension Development Host]*).
   - En la nueva ventana, abre una carpeta que contenga múltiples repositorios de Git.
   - En la barra lateral izquierda verás el icono de **Git Project Explorer**.

---

## Configuración

En la configuración de VS Code (`settings.json`) puedes personalizar:

```json
{
  // Profundidad máxima de búsqueda de repositorios Git en el workspace
  "gitProjectExplorer.searchDepth": 4,

  // Patrones a excluir en el escaneo
  "gitProjectExplorer.excludePatterns": [
    "**/node_modules/**",
    "**/.cache/**",
    "**/dist/**",
    "**/build/**",
    "**/target/**",
    "**/.venv/**"
  ],

  // Nombres candidatos para la rama principal al usar 'Pull from Main'
  "gitProjectExplorer.defaultBranchNames": [
    "main",
    "master",
    "develop"
  ]
}
```

---

## Estructura del Código

```
multi-repo-manager/
├── .vscode/                     # Configuración de depuración y compilación
│   ├── launch.json
│   └── tasks.json
├── resources/                   # Iconos vectoriales (Activity Bar)
│   └── git-project-explorer.svg
├── src/
│   ├── extension.ts             # Punto de entrada y registro de comandos
│   ├── models/
│   │   └── types.ts             # Interfaces TypeScript
│   ├── services/
│   │   ├── gitService.ts        # Motor de Git y escáner de repositorios
│   │   └── outputChannel.ts     # Canal de logs 'Git Project Explorer'
│   └── views/
│       ├── explorer/            # TreeDataProvider de la sección Explorer
│       ├── commands/            # TreeDataProvider de la sección Commands
│       └── cli/                 # WebviewViewProvider de la sección CLI
├── package.json
├── tsconfig.json
└── README.md
```
