"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, CheckCircle2, SquareKanban } from "lucide-react";

interface SyncSubResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface SyncResult {
  jira: SyncSubResult;
  confluence: SyncSubResult;
}

interface Props {
  onSynced: () => void;
}

export default function AtlassianPanel({ onSynced }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setError(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/atlassian", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setLastSync(json.data as SyncResult);
      onSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const totalImported = lastSync
    ? lastSync.jira.imported + lastSync.confluence.imported
    : 0;
  const allErrors = lastSync
    ? [...lastSync.jira.errors, ...lastSync.confluence.errors]
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <SquareKanban className="h-4 w-4 text-blue-500" />
            Jira &amp; Confluence
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSync}
            disabled={syncing}
            title="Sync Jira & Confluence"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">
            {error}
          </div>
        )}

        {lastSync && !error && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded-md px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              {totalImported > 0
                ? `Imported ${totalImported} item${totalImported !== 1 ? "s" : ""}`
                : "Already up to date"}
              {lastSync.jira.skipped + lastSync.confluence.skipped > 0 && (
                <span className="text-muted-foreground ml-1">
                  · {lastSync.jira.skipped + lastSync.confluence.skipped} skipped
                </span>
              )}
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground px-1">
              <span>Jira: {lastSync.jira.imported} new</span>
              <span>·</span>
              <span>Confluence: {lastSync.confluence.imported} new</span>
            </div>
            {allErrors.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs space-y-0.5">
                {allErrors.slice(0, 3).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {allErrors.length > 3 && (
                  <p className="text-muted-foreground">+{allErrors.length - 3} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {!lastSync && !error && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Pull your Jira issues and Confluence pages into this week's log.
            </p>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {syncing ? "Syncing…" : "Sync Jira & Confluence"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
