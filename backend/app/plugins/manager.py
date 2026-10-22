"""Plugin lifecycle manager."""

import time
from typing import Any, Dict, List, Optional
import structlog

from app.plugins.base import AnalyticsPlugin, PluginMetadata, PluginResult, PluginStatus
from app.plugins.registry import plugin_registry
from app.plugins.sandbox import PluginSandbox

logger = structlog.get_logger()


class PluginInstance:
    """Manages a single plugin instance."""

    def __init__(self, plugin: AnalyticsPlugin, config: Dict[str, Any]):
        self.plugin = plugin
        self.config = config
        self.results: List[PluginResult] = []
        self.enabled = False
        self.error: Optional[str] = None
        self.created_at = time.time()

    def initialize(self) -> None:
        """Initialize the plugin."""
        try:
            self.plugin.initialize(self.config)
            self.enabled = True
            self.error = None
            logger.info("Plugin initialized", name=self.plugin.get_metadata().name)
        except Exception as e:
            self.error = str(e)
            self.enabled = False
            logger.error("Plugin initialization failed", name=self.plugin.get_metadata().name, error=str(e))

    def process_frame(self, frame_data: Dict[str, Any]) -> Optional[PluginResult]:
        """Process a frame if enabled."""
        if not self.enabled:
            return None
        try:
            result = self.plugin.process_frame(frame_data)
            if result:
                self.results.append(result)
                # Keep only last 1000 results
                if len(self.results) > 1000:
                    self.results = self.results[-1000:]
            return result
        except Exception as e:
            self.error = str(e)
            logger.error("Plugin frame processing error", name=self.plugin.get_metadata().name, error=str(e))
            return None

    def process_event(self, event: Dict[str, Any]) -> Optional[PluginResult]:
        """Process a zone event if enabled."""
        if not self.enabled:
            return None
        try:
            result = self.plugin.process_event(event)
            if result:
                self.results.append(result)
            return result
        except Exception as e:
            self.error = str(e)
            return None

    def get_results(self, limit: int = 100) -> List[PluginResult]:
        """Get recent results."""
        return self.results[-limit:]

    def cleanup(self) -> None:
        """Cleanup plugin resources."""
        try:
            self.plugin.cleanup()
        except Exception:
            pass
        self.enabled = False


class PluginManager:
    """Manages plugin lifecycle and execution."""

    def __init__(self):
        self._instances: Dict[str, PluginInstance] = {}
        self._sandbox = PluginSandbox()

    def install_plugin(self, plugin: AnalyticsPlugin, config: Optional[Dict[str, Any]] = None) -> str:
        """Install and initialize a plugin."""
        metadata = plugin.get_metadata()
        name = metadata.name

        if name in self._instances:
            raise ValueError(f"Plugin '{name}' is already installed")

        instance = PluginInstance(plugin, config or {})
        instance.initialize()
        self._instances[name] = instance

        plugin_registry.set_status(name, PluginStatus.ENABLED if instance.enabled else PluginStatus.ERROR)
        return name

    def uninstall_plugin(self, name: str) -> None:
        """Uninstall a plugin."""
        if name not in self._instances:
            raise ValueError(f"Plugin '{name}' is not installed")

        instance = self._instances[name]
        instance.cleanup()
        del self._instances[name]
        plugin_registry.set_status(name, PluginStatus.DISABLED)

    def enable_plugin(self, name: str) -> None:
        """Enable a plugin."""
        if name not in self._instances:
            raise ValueError(f"Plugin '{name}' is not installed")

        instance = self._instances[name]
        instance.enabled = True
        plugin_registry.set_status(name, PluginStatus.ENABLED)

    def disable_plugin(self, name: str) -> None:
        """Disable a plugin."""
        if name not in self._instances:
            raise ValueError(f"Plugin '{name}' is not installed")

        instance = self._instances[name]
        instance.enabled = False
        plugin_registry.set_status(name, PluginStatus.DISABLED)

    def process_frame(self, frame_data: Dict[str, Any]) -> Dict[str, PluginResult]:
        """Process a frame through all enabled plugins."""
        results = {}
        for name, instance in self._instances.items():
            result = instance.process_frame(frame_data)
            if result:
                results[name] = result
        return results

    def process_event(self, event: Dict[str, Any]) -> Dict[str, PluginResult]:
        """Process a zone event through all enabled plugins."""
        results = {}
        for name, instance in self._instances.items():
            result = instance.process_event(event)
            if result:
                results[name] = result
        return results

    def get_plugin_results(self, name: str, limit: int = 100) -> List[PluginResult]:
        """Get results for a specific plugin."""
        if name not in self._instances:
            return []
        return self._instances[name].get_results(limit)

    def list_installed(self) -> List[Dict]:
        """List all installed plugins with their status."""
        result = []
        for name, instance in self._instances.items():
            metadata = instance.plugin.get_metadata()
            result.append({
                "name": metadata.name,
                "version": metadata.version,
                "author": metadata.author,
                "description": metadata.description,
                "category": metadata.category,
                "enabled": instance.enabled,
                "error": instance.error,
                "result_count": len(instance.results),
                "created_at": instance.created_at,
            })
        return result

    def cleanup_all(self) -> None:
        """Cleanup all plugins."""
        for instance in self._instances.values():
            instance.cleanup()
        self._instances.clear()


# Global singleton
plugin_manager = PluginManager()
