"use client";

import { useEffect, useRef } from "react";

type ProjectFrameProps = {
  projectId: string;
  src: string;
  title: string;
};

type StorageMessage = {
  type: string;
  key: string;
  value?: string | null;
};

const storageKeys: Record<string, string> = {
  "javascript-notes": "javascript-quick-notes",
  "javascript-todo-list": "javascript-todo-list",
};

function isStorageMessage(value: unknown): value is StorageMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "key" in value &&
    typeof value.key === "string" &&
    (!("value" in value) || typeof value.value === "string" || value.value === null)
  );
}

export default function ProjectFrame({ projectId, src, title }: ProjectFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const storageKey = storageKeys[projectId];

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    function handleStorageMessage(event: MessageEvent<unknown>) {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame || !isStorageMessage(event.data)) {
        return;
      }

      if (event.data.key !== storageKey) {
        return;
      }

      try {
        if (
          event.data.type === "workspace:storage:set" &&
          typeof event.data.value === "string"
        ) {
          if (event.data.value.length > 2_000_000) {
            throw new Error("This project has reached the browser storage limit.");
          }
          localStorage.setItem(storageKey, event.data.value);
          frame.postMessage({ type: "workspace:storage:saved", key: storageKey }, "*");
        }
      } catch {
        frame.postMessage(
          { type: "workspace:storage:error", key: storageKey },
          "*",
        );
      }
    }

    window.addEventListener("message", handleStorageMessage);
    return () => window.removeEventListener("message", handleStorageMessage);
  }, [storageKey]);

  function initializeStorage() {
    if (!storageKey) {
      return;
    }

    const frame = frameRef.current?.contentWindow;
    if (!frame) {
      return;
    }

    try {
      frame.postMessage(
        {
          type: "workspace:storage:init",
          key: storageKey,
          value: localStorage.getItem(storageKey),
        },
        "*",
      );
    } catch {
      frame.postMessage({ type: "workspace:storage:error", key: storageKey }, "*");
    }
  }

  return (
    <iframe
      className="project-frame"
      ref={frameRef}
      title={title}
      src={src}
      sandbox="allow-scripts allow-forms allow-popups"
      referrerPolicy="no-referrer"
      onLoad={initializeStorage}
    />
  );
}
