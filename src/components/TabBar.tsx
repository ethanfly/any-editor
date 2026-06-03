import React from 'react';
import type { OpenTab } from '../types';
import './TabBar.css';

interface TabBarProps {
  tabs: OpenTab[];
  activeTabPath: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabPath,
  onTabClick,
  onTabClose,
}) => {
  if (tabs.length === 0) {
    return (
      <div className="tab-bar tab-bar-empty">
        <div className="tab-bar-placeholder">
          <span className="logo-icon">AE</span>
          <span className="logo-text">Any Editor</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={`tab-item ${tab.path === activeTabPath ? 'active' : ''}`}
            onClick={() => onTabClick(tab.path)}
            title={tab.path}
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
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.path);
              }}
              title="关闭"
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
