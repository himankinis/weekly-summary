"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, CheckCircle2, MessageSquare } from "lucide-react";

interface SyncResult {
  imported: number;
  skipped: number;
  errors: string[];
  file: string;
}

interface Props {
  onSynced: () => void;
}

export default function TeamsPanel({ onSynced }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setError(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/teams", { method: "POST" });
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-teal-500" />
            Teams Chat
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSync}
            disabled={syncing}
            title="Sync Teams export"
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
            <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 rounded-md px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              {lastSync.imported > 0
                ? `Imported ${lastSync.imported} message${lastSync.imported !== 1 ? "s" : ""}`
                : "Already up to date"}
              {lastSync.skipped > 0 && (
                <span className="text-muted-foreground ml-1">
                  · {lastSync.skipped} skipped
                </span>
              )}
            </div>
            {lastSync.errors.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs space-y-0.5">
                {lastSync.errors.slice(0, 3).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                {lastSync.errors.length > 3 && (
                  <p className="text-muted-foreground">+{lastSync.errors.length - 3} more</p>
                )}
              </div>
            )}
          </div>
        )}

        {!lastSync && !error && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-1">
              Reads from{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                ~/OneDrive - FICO/WeeklyPulse/teams_export.json
              </code>
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Export your Teams chat messages as JSON and place the file there.
            </p>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {syncing ? "Importing…" : "Import Teams"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
