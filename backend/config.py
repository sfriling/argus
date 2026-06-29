"""Backward-compatible re-exports. The real config core lives in backend.settings."""
from __future__ import annotations

from backend.settings import (  # noqa: F401
    AppConfig,
    Instance,
    actions_writable,
    config_writable,
    default_config,
    is_localhost,
    load,
    load_config,
    resolve_config_path,
    save,
    to_yaml,
    validate,
)
