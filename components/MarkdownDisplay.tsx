
import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';

interface MarkdownDisplayProps {
  content: string;
  className?: string;
}

const MarkdownDisplay: React.FC<MarkdownDisplayProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');

  useEffect(() => {
    if (!content) {
      setHtmlContent('');
      return;
    }

    let processed = content;

    // 1. Aggressive Education Numbering (1.1, a), (i), etc.)
    // Matches start of line or after punctuation
    const numberPattern = /(?:\r\n|\r|\n|^|\.\s+)\s*(\(?\d+(\.\d+)+\.?|\d+\.|\(?[a-z]\)|\(?[ivx]+\))(\s+|(?=\n))/gi;
    processed = processed.replace(numberPattern, (match, number, space) => {
        if (match.includes('**')) return match; // Already bold
        const cleanNum = number.trim();
        if (/^\d+$/.test(cleanNum)) return match; // Skip plain digits
        return `\n\n**${cleanNum}** `; 
    });

    // 2. Format specific headers from AI
    processed = processed.replace(/(?:\r\n|\r|\n|^)\s*(Method|Working|Final Answer|Solution)(\s*:?)/gi, '\n\n**$1$2**');

    // 3. Fix potential run-on lists
    processed = processed.replace(/([^\n])\n(?=\s*(\(?\d+(\.\d+)+|\d+\.|\(?[a-z]\)))/gi, '$1\n\n');

    const mathMap: Record<string, string> = {};
    let mathIndex = 0;
    const protectedText = processed.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$]+?\$)/g, (match) => {
        if (match === '$$' || match === '$') return match;
        const placeholder = `MATH_PLACEHOLDER_${mathIndex++}`;
        mathMap[placeholder] = match;
        return placeholder;
    });
    
    let parsedHtml = (marked as any).parse(protectedText, { breaks: false, gfm: true });

    Object.keys(mathMap).forEach(key => {
      parsedHtml = parsedHtml.replace(key, mathMap[key]);
    });

    setHtmlContent(parsedHtml);
  }, [content]);

  useEffect(() => {
    if (!containerRef.current || !htmlContent) return;
    const mathJax = (window as any).MathJax;
    if (mathJax && mathJax.typesetPromise) {
      mathJax.typesetPromise([containerRef.current]).catch(() => {});
    }
  });

  return (
    <div 
      ref={containerRef}
      className={`prose prose-indigo max-w-none text-gray-900 font-serif ${className} print:prose-sm`}
      style={{ lineHeight: '1.7' }}
      dangerouslySetInnerHTML={{ __html: htmlContent }} 
    />
  );
};

export default MarkdownDisplay;
