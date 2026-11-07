import React, { useState, useEffect } from 'react';

const THEME_KEY = 'PHARMACY_APP_THEME_MODE';
const FONT_SIZE_KEY = 'PHARMACY_APP_FONT_SIZE';

export function useThemeAndFontSize() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  const [fontSize, setFontSize] = useState(() => {
    try {
      return localStorage.getItem(FONT_SIZE_KEY) || 'md';
    } catch (e) {
      return 'md';
    }
  });

  // Apply theme to <html>
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('theme-light');
      } else {
        root.classList.remove('theme-light');
      }
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }, [theme]);

  // Apply font size / zoom factor cleanly without breaking layouts
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.setAttribute('data-font-size', fontSize);
      localStorage.setItem(FONT_SIZE_KEY, fontSize);

      const zoomFactorMap = {
        sm: 0.9,
        md: 1.0,
        lg: 1.1,
        xl: 1.2
      };
      const factor = zoomFactorMap[fontSize] || 1.0;

      // In Electron desktop environment, use native webContents zoomFactor
      if (typeof window !== 'undefined' && window.require) {
        try {
          const { ipcRenderer, webFrame } = window.require('electron');
          if (webFrame && typeof webFrame.setZoomFactor === 'function') {
            webFrame.setZoomFactor(factor);
          } else if (ipcRenderer) {
            ipcRenderer.send('window:set-zoom-factor', factor);
          }
        } catch (e) {
          console.warn('Native zoom apply error:', e);
        }
      }
    } catch (e) {}
  }, [fontSize]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const increaseFontSize = () => {
    setFontSize((prev) => {
      if (prev === 'sm') return 'md';
      if (prev === 'md') return 'lg';
      if (prev === 'lg') return 'xl';
      return 'xl';
    });
  };

  const decreaseFontSize = () => {
    setFontSize((prev) => {
      if (prev === 'xl') return 'lg';
      if (prev === 'lg') return 'md';
      if (prev === 'md') return 'sm';
      return 'sm';
    });
  };

  const resetFontSize = () => {
    setFontSize('md');
  };

  return {
    theme,
    fontSize,
    toggleTheme,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize
  };
}
