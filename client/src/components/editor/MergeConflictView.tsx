import React, { useState, useEffect, useMemo } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { putFileContent } from '../../api/files';
import {
  extractBranchNames,
  buildOursVersion,
  buildTheirsVersion,
  conflictResultKey,
} from '../../utils/mergeConflict';

interface MergeConflictViewProps {
  conflictContent: string;
  filePath: string;
  language: string;
  theme: string;
  onSaved: (resolved: string) => void;
  onClose: () => void;
}

const MONACO_OPTIONS = {
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono',Menlo,monospace",
  wordWrap: 'off' as const,
  lineNumbers: 'on' as const,
};

const READONLY_OPTIONS = {
  ...MONACO_OPTIONS,
  readOnly: true,
  domReadOnly: true,
};

export default function MergeConflictView({
  conflictContent,
  filePath,
  language,
  theme,
  onSaved,
  onClose,
}: MergeConflictViewProps) {
  const [resultContent, setResultContent] = useState<string>(() => {
    return localStorage.getItem(conflictResultKey(filePath)) ?? conflictContent;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(conflictResultKey(filePath), resultContent);
  }, [filePath, resultContent]);

  const { ours: oursBranch, theirs: theirsBranch } = useMemo(
    () => extractBranchNames(conflictContent),
    [conflictContent],
  );
  const oursContent = useMemo(() => buildOursVersion(conflictContent), [conflictContent]);
  const theirsContent = useMemo(() => buildTheirsVersion(conflictContent), [conflictContent]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await putFileContent(filePath, resultContent);
      localStorage.removeItem(conflictResultKey(filePath));
      onSaved(resultContent);
    } catch {
      setSaveError('Save failed');
    } finally {
      setSaving(false);
    }
  }

  const paneHeaderStyle: React.CSSProperties = {
    height: 32,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    gap: 8,
    background: 'var(--color-bg-sidebar)',
    borderBottom: '1px solid var(--color-border)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    userSelect: 'none',
  };

  const paneStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    borderRight: '1px solid var(--color-border)',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top strip */}
      <div style={{
        height: 36,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: 'var(--color-bg-sidebar)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e8a838' }}>
          ⚠ Merge Conflicts
        </span>
        <button
          onClick={onClose}
          title="Back to source"
          style={{
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: '#007acc',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          ⌨ Source
        </button>
      </div>

      {/* Three-pane row */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* OURS pane */}
        <div style={paneStyle}>
          <div style={paneHeaderStyle}>
            <span style={{ color: '#4ec9b0' }}>OURS</span>
            <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>
              {oursBranch}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <Editor
              value={oursContent}
              language={language}
              theme={theme}
              options={READONLY_OPTIONS}
            />
          </div>
        </div>

        {/* RESULT pane */}
        <div style={{ ...paneStyle }}>
          <div style={paneHeaderStyle}>
            <span style={{ color: 'var(--color-text-primary)' }}>RESULT</span>
            <div style={{ flex: 1 }} />
            {saveError && (
              <span style={{ color: '#f48771', fontWeight: 400, fontSize: 11 }}>{saveError}</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              title="Save resolved file to disk"
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                background: saving ? '#555' : '#007acc',
                border: 'none',
                borderRadius: 4,
                cursor: saving ? 'not-allowed' : 'pointer',
                userSelect: 'none',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <DiffEditor
              original={oursContent}
              modified={resultContent}
              language={language}
              theme={theme}
              options={{
                ...MONACO_OPTIONS,
                renderSideBySide: false,
              }}
              onMount={(editor) => {
                const modifiedEditor = editor.getModifiedEditor();
                modifiedEditor.onDidChangeModelContent(() => {
                  setResultContent(modifiedEditor.getValue());
                });
              }}
            />
          </div>
        </div>

        {/* THEIRS pane */}
        <div style={{ ...paneStyle, borderRight: 'none' }}>
          <div style={paneHeaderStyle}>
            <span style={{ color: '#569cd6' }}>THEIRS</span>
            <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>
              {theirsBranch}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <Editor
              value={theirsContent}
              language={language}
              theme={theme}
              options={READONLY_OPTIONS}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
