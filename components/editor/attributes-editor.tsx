"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ATTR_KEY_MAX,
  ATTR_VALUE_STR_MAX,
  MAX_ATTRS_PER_ELEMENT,
  type AttributeValue,
  type Attributes,
} from "@/lib/graph/types";

/**
 * The attribute bag editor shared by the node and edge inspectors. The store
 * holds the committed bag; this component keeps only ephemeral edit buffers (a
 * key being renamed, a number being typed) and commits through the passed
 * mutators. Rows are keyed by attribute name, so a rename remounts the row with
 * the new name and its buffers reset cleanly. Editing is UI-only — Python reads
 * these values (see lib/editor/python.ts).
 */
export function AttributesEditor({
  attributes,
  onSet,
  onRename,
  onRemove,
}: {
  attributes: Attributes;
  onSet: (key: string, value: AttributeValue) => void;
  onRename: (oldKey: string, newKey: string) => void;
  onRemove: (key: string) => void;
}) {
  const entries = Object.entries(attributes);
  const atCap = entries.length >= MAX_ATTRS_PER_ELEMENT;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Attributes</Label>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={atCap}
          title={atCap ? `At most ${MAX_ATTRS_PER_ELEMENT} attributes` : undefined}
          onClick={() => onSet(freshKey(attributes), "")}
        >
          <Plus /> Add
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          None yet — add data your algorithm can read.
        </p>
      ) : (
        <div className="grid gap-1.5">
          {entries.map(([key, value]) => (
            <AttributeRow
              key={key}
              attrKey={key}
              value={value}
              siblingKeys={entries.map(([k]) => k).filter((k) => k !== key)}
              onSet={onSet}
              onRename={onRename}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type AttrType = "string" | "number" | "boolean";

function AttributeRow({
  attrKey,
  value,
  siblingKeys,
  onSet,
  onRename,
  onRemove,
}: {
  attrKey: string;
  value: AttributeValue;
  siblingKeys: string[];
  onSet: (key: string, value: AttributeValue) => void;
  onRename: (oldKey: string, newKey: string) => void;
  onRemove: (key: string) => void;
}) {
  const type = attrTypeOf(value);
  const [keyDraft, setKeyDraft] = useState(attrKey);
  const [numDraft, setNumDraft] = useState(
    type === "number" ? String(value) : "",
  );

  const commitKey = () => {
    const next = keyDraft.trim();
    if (next === attrKey) return;
    // revert on a blank or already-taken key rather than clobbering a sibling
    if (!next || siblingKeys.includes(next)) {
      setKeyDraft(attrKey);
      return;
    }
    onRename(attrKey, next);
  };

  const changeType = (nextType: AttrType) => {
    if (nextType === type) return;
    const coerced = coerce(value, nextType);
    onSet(attrKey, coerced);
    if (nextType === "number") setNumDraft(String(coerced));
  };

  return (
    <div className="grid gap-1 rounded-md border bg-muted/30 p-1.5">
      <div className="flex items-center gap-1">
        <Input
          aria-label="Attribute name"
          className="h-6 flex-1 text-xs"
          maxLength={ATTR_KEY_MAX}
          placeholder="name"
          value={keyDraft}
          onChange={(event) => setKeyDraft(event.target.value)}
          onBlur={commitKey}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setKeyDraft(attrKey);
              event.currentTarget.blur();
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Remove attribute"
          onClick={() => onRemove(attrKey)}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Select value={type} onValueChange={(v) => changeType(v as AttrType)}>
          <SelectTrigger
            aria-label="Attribute type"
            className="h-6 w-[84px] text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string">text</SelectItem>
            <SelectItem value="number">number</SelectItem>
            <SelectItem value="boolean">boolean</SelectItem>
          </SelectContent>
        </Select>

        {type === "boolean" ? (
          <label className="flex h-6 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={value === true}
              onCheckedChange={(checked) => onSet(attrKey, checked)}
              aria-label="Attribute value"
            />
            {value === true ? "true" : "false"}
          </label>
        ) : type === "number" ? (
          <Input
            aria-label="Attribute value"
            type="number"
            step="any"
            inputMode="decimal"
            className="h-6 flex-1 text-xs"
            placeholder="0"
            value={numDraft}
            onChange={(event) => {
              const raw = event.target.value;
              setNumDraft(raw);
              const parsed = Number(raw);
              if (raw !== "" && Number.isFinite(parsed)) onSet(attrKey, parsed);
            }}
            onBlur={() => {
              const parsed = Number(numDraft);
              if (numDraft === "" || !Number.isFinite(parsed)) {
                setNumDraft("0");
                onSet(attrKey, 0);
              }
            }}
          />
        ) : (
          <Input
            aria-label="Attribute value"
            className="h-6 flex-1 text-xs"
            maxLength={ATTR_VALUE_STR_MAX}
            placeholder="value"
            value={String(value)}
            onChange={(event) => onSet(attrKey, event.target.value)}
          />
        )}
      </div>
    </div>
  );
}

function attrTypeOf(value: AttributeValue): AttrType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

/** Best-effort conversion when the user switches an attribute's type. */
function coerce(value: AttributeValue, type: AttrType): AttributeValue {
  if (type === "string") return typeof value === "string" ? value : String(value);
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value === "true" || value === "1";
}

/** First free `key`, `key2`, `key3`, … for a freshly added attribute. */
function freshKey(existing: Attributes): string {
  if (!("key" in existing)) return "key";
  for (let i = 2; ; i++) {
    const candidate = `key${i}`;
    if (!(candidate in existing)) return candidate;
  }
}
