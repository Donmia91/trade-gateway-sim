"use client";

import { useState, useEffect } from "react";
import { HeaderBar } from "./HeaderBar";
import { SourceSelector } from "./SourceSelector";
import { SimControl } from "./SimControl";
import { SuiteRunner } from "./SuiteRunner";
import { StatsCards, type SimStatus } from "./StatsCards";
import { SnapshotChart } from "./SnapshotChart";
import { LedgerTable } from "./LedgerTable";

export default function DashPage() {
  const [status, setStatus] = useState<SimStatus | null>(null);

  function refresh() {
    fetch("/api/sim/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error);
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, []);

  if (status === null) {
    return (
      <>
        <div className="header">
          <div className="header-inner">
            <div className="brand">
              <span className="title">Trade Gateway Simulator</span>
              <span className="sub">Loading…</span>
            </div>
          </div>
        </div>
        <div className="container">
          <p className="small">Loading…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="header">
        <HeaderBar
          running={status.running}
          dataSource={status.dataSource ?? "SIM"}
          killSwitch={status.killSwitch}
          paperMode={status.paperMode}
        />
      </div>
      <div className="container">
        <div className="row">
          <StatsCards status={status} />
        </div>
        <div className="row">
          <div className="col-8">
            <div className="card">
              <SourceSelector status={status} onAction={refresh} />
              <SimControl status={status} onAction={refresh} />
            </div>
          </div>
          <div className="col-4">
            <div className="card">
              <SuiteRunner status={status} onAction={refresh} />
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-7">
            <div className="card">
              <SnapshotChart />
            </div>
          </div>
          <div className="col-5">
            <div className="card">
              <LedgerTable />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
