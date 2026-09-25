"""Plugin registry for discovering and loading plugins."""

import importlib
import importlib.metadata
import os
import json
from pathlib import Path
from typing import Dict, List, Optional, Type
import structlog

from app.plugins.base import AnalyticsPlugin, PluginMetadata, PluginStatus

logger = structlog.get_logger()

# Built-in plugins directory
BUILTIN_PLUGINS_DIR = Path(__file__).parent / "builtin"


class PluginRegistry:
    """Registry for discovering and managing analytics plugins."""

    def __init__(self):
        self._plugins: Dict[str, Type[AnalyticsPlugin]] = {}
        self._metadata: Dict[str, PluginMetadata] = {}
        self._status: Dict[str, PluginStatus] = {}

    def register(self, plugin_class: Type[AnalyticsPlugin]) -> None:
        """Register a plugin class."""
        instance = plugin_class()
        metadata = instance.get_metadata()
        self._plugins[metadata.name] = plugin_class
        self._metadata[metadata.name] = metadata
        self._status[metadata.name] = PluginStatus.INSTALLED
        logger.info("Plugin registered", name=metadata.name, version=metadata.version)

    def discover_builtin(self) -> None:
        """Discover built-in plugins."""
        if not BUILTIN_PLUGINS_DIR.exists():
            return

        for plugin_dir in BUILTIN_PLUGINS_DIR.iterdir():
            if plugin_dir.is_dir() and (plugin_dir / "plugin.json").exists():
                try:
                    self._load_plugin_from_dir(plugin_dir)
                except Exception as e:
                    logger.error("Failed to load builtin plugin", dir=str(plugin_dir), error=str(e))

    def discover_entry_points(self) -> None:
        """Discover plugins via Python entry points."""
        try:
            eps = importlib.metadata.entry_points()
            plugin_eps = eps.select(group="nexusvision.plugins") if hasattr(eps, "select") else []
            for ep in plugin_eps:
                try:
                    plugin_class = ep.load()
                    if isinstance(plugin_class, type) and issubclass(plugin_class, AnalyticsPlugin):
                        self.register(plugin_class)
                except Exception as e:
                    logger.error("Failed to load entry point plugin", name=ep.name, error=str(e))
        except Exception:
            pass

    def _load_plugin_from_dir(self, plugin_dir: Path) -> None:
        """Load a plugin from a directory."""
        config_path = plugin_dir / "plugin.json"
        with open(config_path) as f:
            config = json.load(f)

        module_name = config.get("module", "plugin")
        module_path = plugin_dir / f"{module_name}.py"

        if not module_path.exists():
            raise FileNotFoundError(f"Plugin module not found: {module_path}")

        spec = importlib.util.spec_from_file_location(
            f"nexusvision.plugins.{config['name']}",
            str(module_path),
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        plugin_class_name = config.get("class", "Plugin")
        plugin_class = getattr(module, plugin_class_name)

        if issubclass(plugin_class, AnalyticsPlugin):
            self.register(plugin_class)

    def get_plugin(self, name: str) -> Optional[Type[AnalyticsPlugin]]:
        """Get a plugin class by name."""
        return self._plugins.get(name)

    def get_metadata(self, name: str) -> Optional[PluginMetadata]:
        """Get plugin metadata by name."""
        return self._metadata.get(name)

    def list_plugins(self) -> List[Dict]:
        """List all registered plugins with metadata and status."""
        result = []
        for name, metadata in self._metadata.items():
            result.append({
                "name": metadata.name,
                "version": metadata.version,
                "author": metadata.author,
                "description": metadata.description,
                "category": metadata.category,
                "status": self._status.get(name, PluginStatus.INSTALLED).value,
            })
        return result

    def set_status(self, name: str, status: PluginStatus) -> None:
        """Update plugin status."""
        self._status[name] = status

    def get_status(self, name: str) -> PluginStatus:
        """Get plugin status."""
        return self._status.get(name, PluginStatus.INSTALLED)


# Global registry singleton
plugin_registry = PluginRegistry()
