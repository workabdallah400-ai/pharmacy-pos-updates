const fs = require('fs');

let app = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add ErrorBoundary import
if (!app.includes('ErrorBoundary')) {
  app = "import { ErrorBoundary } from './components/ErrorBoundary';\n" + app;
}

// 2. Wrap main with ErrorBoundary
const oldMainStart = '<main className="flex-1 flex flex-col overflow-hidden bg-[#0B1220] relative">';
const newMainStart = `<main className="flex-1 flex flex-col overflow-hidden bg-[#0B1220] relative">
          <ErrorBoundary>`;

const oldMainEnd = '</main>';
const newMainEnd = `</ErrorBoundary>
        </main>`;

if (app.includes(oldMainStart) && !app.includes('<ErrorBoundary>')) {
  app = app.replace(oldMainStart, newMainStart);
  app = app.replace(oldMainEnd, newMainEnd);
}

fs.writeFileSync('src/App.jsx', app, 'utf8');
console.log('App.jsx wrapped in ErrorBoundary successfully!');
