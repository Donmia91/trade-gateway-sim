"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ui_scan_fx";

export interface HeaderBarProps {
  running: boolean;
  dataSource: string;
  killSwitch: boolean;
  paperMode: boolean;
}

export function HeaderBar({
  running,
  dataSource,
  killSwitch,
  paperMode,
}: HeaderBarProps) {
  const [scanOn, setScanOn] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const on = stored !== "false";
      setScanOn(on);
      if (on) {
        document.body.classList.add("scan");
      } else {
        document.body.classList.remove("scan");
      }
    } catch {
      setScanOn(true);
    }
  }, []);

  function toggleScan() {
    const next = !scanOn;
    setScanOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
    if (next) {
      document.body.classList.add("scan");
    } else {
      document.body.classList.remove("scan");
    }
  }

  const dataSourceLabel =
    dataSource === "KRAKEN_PUBLIC"
      ? "Kraken"
      : dataSource === "COINBASE_PUBLIC"
        ? "Coinbase"
        : dataSource || "SIM";

  return (
    <div className="header-inner">
      <div className="brand">
        <span className="title">Trade Gateway Simulator</span>
        <span className="sub">Mission Control · Paper only</span>
      </div>
      <div className="header-right">
        <span className="pill">
          <span className={`dot ${running ? "ok" : "danger"}`} />
          {running ? "RUNNING" : "STOPPED"}
        </span>
        <span className="pill">DATA: {dataSourceLabel}</span>
        <span className="pill">
          <span className={`dot ${paperMode ? "ok" : "warn"}`} />
          PAPER {paperMode ? "ON" : "OFF"}
        </span>
        <span className="pill">
          <span className={`dot ${killSwitch ? "danger" : "ok"}`} />
          KILL {killSwitch ? "ON" : "OFF"}
        </span>
        <button
          type="button"
          className="btn"
          onClick={toggleScan}
          aria-pressed={scanOn}
        >
          Scan FX: {scanOn ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
