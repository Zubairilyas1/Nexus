"""Base class for NexusVision analytics plugins."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum


class PluginStatus(str, Enum):
    INSTALLED = "INSTALLED"
    ENABLED = "ENABLED"
    DISABLED = "DISABLED"
    ERROR = "ERROR"


@dataclass
class PluginMetadata:
    """Plugin metadata."""
    name: str
    version: str
    author: str
    description: str
    category: str = "general"
    config_schema: Dict[str, Any] = field(default_factory=dict)
    min_nexusvision_version: str = "1.0.0"


@dataclass
class PluginResult:
    """Result from a plugin execution."""
    plugin_name: str
    timestamp: float
    data: Dict[str, Any]
    metrics: Dict[str, float] = field(default_factory=dict)
    error: Optional[str] = None


class AnalyticsPlugin(ABC):
    """Abstract base class for analytics plugins."""

    @abstractmethod
    def get_metadata(self) -> PluginMetadata:
        """Return plugin metadata."""
        pass

    @abstractmethod
    def initialize(self, config: Dict[str, Any]) -> None:
        """Initialize the plugin with configuration."""
        pass

    @abstractmethod
    def process_frame(self, frame_data: Dict[str, Any]) -> Optional[PluginResult]:
        """Process a single frame of data.

        Args:
            frame_data: Dict with keys like 'frame_id', 'timestamp', 'detections', 'tracks'

        Returns:
            PluginResult or None if no output
        """
        pass

    @abstractmethod
    def process_event(self, event: Dict[str, Any]) -> Optional[PluginResult]:
        """Process a zone event.

        Args:
            event: Dict with keys like 'event_type', 'track_id', 'zone_id', 'timestamp'

        Returns:
            PluginResult or None
        """
        pass

    def get_results(self) -> List[PluginResult]:
        """Get accumulated results. Override for custom behavior."""
        return []

    def get_config_schema(self) -> Dict[str, Any]:
        """Return JSON schema for plugin configuration."""
        return self.get_metadata().config_schema

    def cleanup(self) -> None:
        """Cleanup resources. Override if needed."""
        pass
