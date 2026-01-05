
import { Subject } from "./types";

// Grade-based color themes for the Premium Cover Page
// main: Primary accent color (usually deep/bold)
// alt: Secondary accent color (usually lighter/vibrant)
export const GRADE_THEMES: Record<string, { main: string, alt: string, text: string }> = {
  "Grade 8": { main: '#c2410c', alt: '#fb923c', text: '#ffffff' }, // Orange
  "Grade 9": { main: '#0d9488', alt: '#2dd4bf', text: '#ffffff' }, // Teal
  "Grade 10": { main: '#2563eb', alt: '#60a5fa', text: '#ffffff' }, // Blue
  "Grade 11": { main: '#4f46e5', alt: '#818cf8', text: '#ffffff' }, // Indigo
  "Grade 12": { main: '#be123c', alt: '#fb7185', text: '#ffffff' }, // Rose
  "University": { main: '#334155', alt: '#94a3b8', text: '#ffffff' }, // Slate
  "default": { main: '#4b5563', alt: '#9ca3af', text: '#ffffff' }
};

// SVG Patterns and Symbols for specific subjects
export const SUBJECT_DECORATIONS: Record<Subject, string> = {
  [Subject.MATHEMATICS]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <text x="10%" y="20%" font-size="24" font-family="serif" fill="currentColor">E = mc²</text>
      <text x="60%" y="15%" font-size="20" font-family="serif" fill="currentColor">a² + b² = c²</text>
      <text x="30%" y="45%" font-size="32" font-family="serif" fill="currentColor">∫ sin(x) dx</text>
      <text x="70%" y="60%" font-size="24" font-family="serif" fill="currentColor">∑ x_i</text>
      <text x="15%" y="80%" font-size="18" font-family="serif" fill="currentColor">lim(x→∞)</text>
      <circle cx="85%" cy="30%" r="40" fill="none" stroke="currentColor" stroke-width="1" />
      <path d="M50 200 L150 200 L100 100 Z" fill="none" stroke="currentColor" stroke-width="1" transform="translate(400, 300)"/>
    </svg>
  `,
  [Subject.PHYSICS]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50%" cy="50%" r="30" fill="currentColor"/>
      <ellipse cx="50%" cy="50%" rx="100" ry="40" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(45 500 500)"/>
      <ellipse cx="50%" cy="50%" rx="100" ry="40" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(-45 500 500)"/>
      <text x="10%" y="30%" font-size="20" fill="currentColor">F = ma</text>
      <text x="80%" y="20%" font-size="20" fill="currentColor">λ</text>
    </svg>
  `,
  [Subject.LIFE_SCIENCE]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 50 Q 100 0, 150 50 T 250 50" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="20%" cy="40%" r="10" fill="currentColor"/>
      <circle cx="25%" cy="35%" r="8" fill="currentColor"/>
      <text x="70%" y="80%" font-size="24" fill="currentColor">DNA</text>
    </svg>
  `,
  [Subject.GEOGRAPHY]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50%" cy="50%" r="150" fill="none" stroke="currentColor" stroke-width="1"/>
      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor"/>
      <line x1="50%" y1="0" x2="50%" y2="100%" stroke="currentColor"/>
    </svg>
  `,
  [Subject.HISTORY]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M100 100 L900 100" stroke="currentColor" stroke-dasharray="10,10"/>
      <text x="10%" y="15%" font-size="16" fill="currentColor">1789</text>
      <text x="40%" y="15%" font-size="16" fill="currentColor">1945</text>
      <text x="80%" y="15%" font-size="16" fill="currentColor">1994</text>
    </svg>
  `,
  [Subject.ENGLISH]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <text x="10%" y="20%" font-size="40" font-family="serif" fill="currentColor">A</text>
      <text x="15%" y="25%" font-size="40" font-family="serif" fill="currentColor">B</text>
      <text x="20%" y="30%" font-size="40" font-family="serif" fill="currentColor">C</text>
    </svg>
  `,
  [Subject.CHEMISTRY]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <text x="10%" y="20%" font-size="20" fill="currentColor">H₂O</text>
      <text x="70%" y="40%" font-size="18" fill="currentColor">NaCl</text>
      <circle cx="50%" cy="60%" r="30" fill="none" stroke="currentColor" stroke-width="1"/>
    </svg>
  `,
  [Subject.PHYSICAL_SCIENCE]: `
    <svg width="100%" height="100%" opacity="0.1" xmlns="http://www.w3.org/2000/svg">
      <path d="M100 100 L900 100" stroke="currentColor" stroke-width="2"/>
      <circle cx="50%" cy="50%" r="40" fill="currentColor"/>
      <text x="10%" y="80%" font-size="24" fill="currentColor">PhySci</text>
    </svg>
  `
};

export const SUBJECT_PATTERNS: Record<Subject, string> = {
  [Subject.MATHEMATICS]: "radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)",
  [Subject.PHYSICS]: "repeating-linear-gradient(45deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 2px, transparent 2px, transparent 10px)",
  [Subject.LIFE_SCIENCE]: "radial-gradient(rgba(0,0,0,0.03) 2px, transparent 2px)",
  [Subject.GEOGRAPHY]: "repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,0,0,0.03) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,0,0,0.03) 20px)",
  [Subject.HISTORY]: "linear-gradient(30deg, rgba(0,0,0,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,0,0,0.02) 87.5%, rgba(0,0,0,0.02))",
  [Subject.ENGLISH]: "linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px)",
  [Subject.CHEMISTRY]: "linear-gradient(120deg, rgba(0,0,0,0.02) 1px, transparent 1px)",
  [Subject.PHYSICAL_SCIENCE]: "repeating-linear-gradient(45deg, rgba(0,0,0,0.01) 0px, rgba(0,0,0,0.01) 1px, transparent 1px, transparent 10px)"
};

export const MOCK_USER = "Lawrence Masiyiwa";
