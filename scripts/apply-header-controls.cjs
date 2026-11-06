const fs = require('fs');

let header = fs.readFileSync('src/components/TopHeader.jsx', 'utf8');

const oldImport = "import { Minus, Square, X, Clock, Calendar, CheckCircle2, Wifi, WifiOff, Cloud, RefreshCw, Sparkles } from 'lucide-react';";
const newImport = "import { Minus, Square, X, Clock, Calendar, CheckCircle2, Wifi, WifiOff, Cloud, RefreshCw, Sparkles, Sun, Moon, ZoomIn, ZoomOut } from 'lucide-react';\nimport { useThemeAndFontSize } from '../utils/useThemeAndFontSize';";

if (header.includes(oldImport)) {
  header = header.replace(oldImport, newImport);
}

const oldRef = "const syncBusyRef = useRef(false);";
const newRef = "const syncBusyRef = useRef(false);\n  const { theme, fontSize, toggleTheme, increaseFontSize, decreaseFontSize } = useThemeAndFontSize();";

if (header.includes(oldRef) && !header.includes('useThemeAndFontSize()')) {
  header = header.replace(oldRef, newRef);
}

const controlsOld = '{/* Windows Desktop Control Buttons */}';
const controlsNew = `{/* Display Controls: Font Zoom & Theme Toggle */}
        <div className="flex items-center gap-1 border-r border-[#23324D] pr-2.5 mr-1">
          {/* Theme Toggle Button (Light / Dark) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] text-amber-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح (Light Mode)' : 'التبديل إلى الوضع الداكن (Dark Mode)'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-cyan-300" />}
          </button>

          {/* Decrease Font Size */}
          <button
            type="button"
            onClick={decreaseFontSize}
            disabled={fontSize === 'sm'}
            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] disabled:opacity-40 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            title="تصغير حجم الخط (A-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Current Font Indicator */}
          <span
            className="text-[10px] font-mono font-bold text-teal-300 bg-[#0B1220] border border-[#23324D] px-1.5 py-0.5 rounded-md"
            title="مستوى حجم الخط الحالي"
          >
            {fontSize === 'sm' ? 'صغير' : fontSize === 'md' ? 'عادي' : fontSize === 'lg' ? 'كبير' : 'ضخم'}
          </span>

          {/* Increase Font Size */}
          <button
            type="button"
            onClick={increaseFontSize}
            disabled={fontSize === 'xl'}
            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] disabled:opacity-40 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            title="تكبير حجم الخط (A+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Windows Desktop Control Buttons */}`;

if (header.includes(controlsOld) && !header.includes('Display Controls: Font Zoom')) {
  header = header.replace(controlsOld, controlsNew);
}

fs.writeFileSync('src/components/TopHeader.jsx', header, 'utf8');
console.log('TopHeader.jsx successfully updated with theme and font controls!');
