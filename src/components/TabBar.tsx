import { useState } from 'react';
import type { OpenTab } from '../types';
import './TabBar.css';

interface TabBarProps {
  tabs: OpenTab[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
  onReorder,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (tabs.length === 0) {
    return (
      <div className="tab-bar tab-bar-empty">
        <div className="tab-bar-placeholder">
          <img className="logo-icon" src="/favicon.svg" alt="Any Editor" />
          <span className="logo-text">Any Editor</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-bar">
      <div className="tab-list" role="tablist">
        {tabs.map((tab, index) => (
          <div
            key={tab.path}
            className={`tab-item ${tab.path === activeTabPath ? 'active' : ''} ${
              overIndex === index && dragIndex !== null && dragIndex !== index ? 'drag-over' : ''
            }`}
            onClick={() => onTabClick(tab.path)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onTabClose(tab.path);
              }
            }}
            title={tab.path}
            role="tab"
            aria-selected={tab.path === activeTabPath}
            draggable={!!onReorder}
            onDragStart={(e) => {
              if (!onReorder) return;
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
            }}
            onDragOver={(e) => {
              if (!onReorder || dragIndex === null) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDragLeave={() => {
              if (overIndex === index) setOverIndex(null);
            }}
            onDrop={(e) => {
              if (!onReorder || dragIndex === null) return;
              e.preventDefault();
              if (dragIndex !== index) onReorder(dragIndex, index);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            <span
              className={`tab-icon ${tab.isBinary ? 'binary' : 'text'}`}
              aria-hidden="true"
            />
            <span className="tab-name">
              {tab.name}
              {tab.isModified && <span className="tab-modified"> ●</span>}
            </span>
            <button
              className="tab-close"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.path);
              }}
              title="关闭"
              aria-label={`关闭 ${tab.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabBar;
