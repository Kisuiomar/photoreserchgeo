"""Low-level wrapper around the ``exiftool`` CLI.

Every public function returns plain Python dicts parsed from exiftool's
JSON output.  Tag names are group-prefixed (``-G`` flag), and numeric
values are returned as numbers (``-n`` flag).
"""

import json
import logging
import subprocess

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 50  # max files per exiftool invocation


def _run(args: list[str], timeout: int = 30) -> str:
    """Execute exiftool and return its stdout."""
    cmd = ["exiftool"] + args
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        # Exit 0 = ok, 1 = minor warnings (corrupt tag, etc.), 2 = real error.
        # JSON output is usually valid even at exit 1, so we only warn on 2.
        if proc.returncode == 2:
            logger.warning("exiftool error (exit 2): %s", proc.stderr.strip())
        return proc.stdout
    except FileNotFoundError:
        raise RuntimeError(
            "exiftool is not installed. "
            "Install with: apt-get install libimage-exiftool-perl"
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"exiftool timed out after {timeout}s")


def read_metadata(file_path: str) -> dict:
    """Read all metadata from *file_path*.

    Returns a flat dict mapping ``"Group:TagName"`` to its value.
    Returns ``{}`` on parse failure.
    """
    stdout = _run(["-j", "-G", "-n", file_path])
    try:
        data = json.loads(stdout)
        return data[0] if data else {}
    except (json.JSONDecodeError, IndexError):
        logger.warning("Failed to parse exiftool JSON for %s", file_path)
        return {}


def read_metadata_batch(file_paths: list[str]) -> list[dict]:
    """Read metadata from multiple files in as few exiftool calls as possible.

    Returns one dict per input path, in the same order.
    """
    results: list[dict] = []
    for i in range(0, len(file_paths), _CHUNK_SIZE):
        chunk = file_paths[i : i + _CHUNK_SIZE]
        timeout = max(30, len(chunk) * 5)
        stdout = _run(["-j", "-G", "-n"] + chunk, timeout=timeout)
        try:
            data = json.loads(stdout)
            results.extend(data)
        except json.JSONDecodeError:
            logger.warning(
                "Batch exiftool JSON parse failed for chunk starting at index %d", i
            )
            results.extend([{} for _ in chunk])
    return results
