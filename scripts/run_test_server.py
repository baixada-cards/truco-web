#!/usr/bin/env python3
"""Materialize and run the exact truco-server revision used by browser tests."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "dependencies.lock.json"
CACHE = ROOT / ".cache" / "truco-server"


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def output(*args: str, cwd: Path | None = None) -> str:
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def main() -> None:
    payload = json.loads(LOCK.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise SystemExit("unsupported dependency lock schema")
    dependency = payload["truco_server"]
    repository = dependency["repository"]
    revision = dependency["revision"]
    if (
        not isinstance(repository, str)
        or not repository.startswith("https://github.com/baixada-cards/")
        or not isinstance(revision, str)
        or len(revision) != 40
    ):
        raise SystemExit("invalid truco-server dependency lock")

    configured = os.environ.get("TRUCO_SERVER_CHECKOUT")
    checkout = Path(configured).resolve() if configured else CACHE
    if configured:
        if output("git", "rev-parse", "HEAD", cwd=checkout) != revision:
            raise SystemExit("TRUCO_SERVER_CHECKOUT is not at the locked revision")
    else:
        checkout.mkdir(parents=True, exist_ok=True)
        if not (checkout / ".git").is_dir():
            run("git", "init", cwd=checkout)
        current_probe = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"],
            cwd=checkout,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        current = current_probe.stdout.strip() if current_probe.returncode == 0 else ""
        if current != revision:
            run("git", "fetch", "--depth", "1", repository, revision, cwd=checkout)
            run("git", "checkout", "--detach", "FETCH_HEAD", cwd=checkout)
        if output("git", "rev-parse", "HEAD", cwd=checkout) != revision:
            raise SystemExit("failed to materialize locked truco-server revision")

    sfw = shutil.which("sfw")
    if sfw is None:
        raise SystemExit("Socket Firewall (sfw) is required to fetch Rust dependencies")
    manifest = checkout / "Cargo.toml"
    os.environ.setdefault("CARGO_NET_GIT_FETCH_WITH_CLI", "true")
    run(sfw, "cargo", "fetch", "--locked", "--manifest-path", str(manifest))

    environment = os.environ.copy()
    environment["CARGO_NET_OFFLINE"] = "true"
    os.execvpe(
        "cargo",
        [
            "cargo",
            "run",
            "--offline",
            "--locked",
            "--manifest-path",
            str(manifest),
            "-p",
            "truco-server",
        ],
        environment,
    )


if __name__ == "__main__":
    main()
