#!/usr/bin/env python3
"""Materialize licensed runtime audio from authenticated private GCS storage."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOCK = ROOT / "private-audio.lock.json"
DEFAULT_DESTINATION = ROOT / "public" / "audio" / "farol"
SAFE_NAME = re.compile(r"^[a-z0-9][a-z0-9.-]+\.m4a$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default=os.environ.get("BAIXADA_PRIVATE_AUDIO_GCS_URI"),
        help="private gs:// bucket prefix; defaults to BAIXADA_PRIVATE_AUDIO_GCS_URI",
    )
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="verify already-materialized files without contacting GCS",
    )
    parser.add_argument(
        "--check-manifest",
        action="store_true",
        help="validate the lock contract without requiring materialized files",
    )
    return parser.parse_args()


def load_lock(path: Path) -> list[dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise SystemExit("unsupported private-audio lock schema")
    files = payload.get("files")
    if not isinstance(files, list) or not files:
        raise SystemExit("private-audio lock must contain a non-empty files list")

    names: set[str] = set()
    for item in files:
        if not isinstance(item, dict):
            raise SystemExit("private-audio lock entries must be objects")
        name = item.get("name")
        digest = item.get("sha256")
        size = item.get("bytes")
        if (
            not isinstance(name, str)
            or not SAFE_NAME.fullmatch(name)
            or name in names
            or not isinstance(digest, str)
            or not re.fullmatch(r"[0-9a-f]{64}", digest)
            or not isinstance(size, int)
            or size <= 0
        ):
            raise SystemExit(f"invalid private-audio lock entry: {item!r}")
        names.add(name)
    return files


def verify(path: Path, expected_size: int, expected_digest: str) -> None:
    data = path.read_bytes()
    if len(data) != expected_size:
        raise SystemExit(
            f"{path.name}: expected {expected_size} bytes, found {len(data)}"
        )
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected_digest:
        raise SystemExit(
            f"{path.name}: SHA-256 mismatch; expected {expected_digest}, found {actual}"
        )


def main() -> None:
    args = parse_args()
    files = load_lock(args.lock.resolve())
    if args.check_manifest:
        print(f"validated {len(files)} private-audio lock entries")
        return

    destination = args.destination.resolve()
    if not args.verify_only:
        if not args.source or not args.source.startswith("gs://"):
            raise SystemExit(
                "set BAIXADA_PRIVATE_AUDIO_GCS_URI or pass --source gs://BUCKET/PREFIX"
            )
        destination.mkdir(parents=True, exist_ok=True)

    for item in files:
        name = str(item["name"])
        expected_size = int(item["bytes"])
        expected_digest = str(item["sha256"])
        target = destination / name
        if args.verify_only:
            if not target.is_file():
                raise SystemExit(f"missing licensed audio: {target}")
            verify(target, expected_size, expected_digest)
            continue

        with tempfile.NamedTemporaryFile(
            prefix=f".{name}.", dir=destination, delete=False
        ) as handle:
            temporary = Path(handle.name)
        try:
            remote = f"{args.source.rstrip('/')}/{name}"
            subprocess.run(
                ["gcloud", "storage", "cp", "--quiet", remote, str(temporary)],
                check=True,
            )
            verify(temporary, expected_size, expected_digest)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)

    verb = "verified" if args.verify_only else "materialized"
    print(f"{verb} {len(files)} licensed audio files")


if __name__ == "__main__":
    main()
