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

  // Apply font size to <html>
  useEffect(() => {
    try {
      const root = document.documentElement;
      root.setAttribute('data-font-size', fontSize);
      localStorage.setItem(FONT_SIZE_KEY, fontSize);
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
