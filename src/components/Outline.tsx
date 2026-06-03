import React, { useMemo } from 'react';
import type { OutlineItem } from '../types';
import './Outline.css';

interface OutlineProps {
  content: string;
  extension: string;
  currentLine: number;
  onNavigate: (line: number) => void;
  isVisible: boolean;
  onToggle: () => void;
}

function parseOutline(content: string, extension: string): OutlineItem[] {
  const items: OutlineItem[] = [];

  if (['md', 'markdown', 'mdown', 'mkd'].includes(extension)) {
    // Parse markdown headings
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) {
        items.push({
          level: match[1].length,
          text: match[2].trim(),
          line: index + 1,
          id: `md-h-${index}`,
        });
      }
    });
  } else if (['html', 'htm'].includes(extension)) {
    // Parse HTML headings
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      items.push({
        level: parseInt(match[1]),
        text: match[2].replace(/<[^>]*>/g, '').trim(),
        line: lineNumber,
        id: `html-h-${match.index}`,
      });
    }
  } else {
    // For other text files, detect common patterns
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      // Markdown-style headings
      const mdMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (mdMatch) {
        items.push({
          level: mdMatch[1].length,
          text: mdMatch[2].trim(),
          line: index + 1,
          id: `line-${index}`,
        });
        return;
      }
      // Comment-style section headers
      const sectionMatch = line.match(/^\/\/+\s*(.+?)\s*\/\/+$|^\/\*\*?\s*(.+?)\s*\*\/$|^#\s+(.+)$|^;+\s*(.+)$/);
      if (sectionMatch) {
        items.push({
          level: 2,
          text: (sectionMatch[1] || sectionMatch[2] || sectionMatch[3] || sectionMatch[4] || '').trim(),
          line: index + 1,
          id: `section-${index}`,
        });
      }
    });
  }

  return items;
}

const Outline: React.FC<OutlineProps> = ({
  content,
  extension,
  currentLine,
  onNavigate,
  isVisible,
  onToggle,
}) => {
  const items = useMemo(() => parseOutline(content, extension), [content, extension]);

  const activeItem = useMemo(() => {
    // Find the closest heading before or at current line
    let closest: OutlineItem | null = null;
    for (const item of items) {
      if (item.line <= currentLine) {
        closest = item;
      } else {
        break;
      }
    }
    return closest;
  }, [items, currentLine]);

  return (
    <div className={`outline-panel ${isVisible ? 'visible' : 'collapsed'}`}>
      <div className="outline-header" onClick={onToggle}>
        <span className="outline-title">
          {isVisible ? '大纲' : '纲'}
        </span>
        <span className="outline-toggle">{isVisible ? '◀' : '▶'}</span>
      </div>
      {isVisible && (
        <div className="outline-body">
          {items.length === 0 ? (
            <div className="outline-empty">当前文件无大纲</div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`outline-item level-${item.level} ${activeItem?.id === item.id ? 'active' : ''}`}
                style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
                onClick={() => onNavigate(item.line)}
                title={item.text}
              >
                <span className="outline-item-text">{item.text}</span>
                <span className="outline-item-line">{item.line}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Outline;
