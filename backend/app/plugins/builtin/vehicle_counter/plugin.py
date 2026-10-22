"""Vehicle Counter Plugin - counts vehicles per zone."""

import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.plugins.base import AnalyticsPlugin, PluginMetadata, PluginResult


class Plugin(AnalyticsPlugin):
    """Counts vehicles entering and exiting zones."""

    def __init__(self):
        self._counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._window_start: float = time.time()
        self._time_window: int = 60
        self._vehicle_classes: List[str] = []

    def get_metadata(self) -> PluginMetadata:
        return PluginMetadata(
            name="vehicle_counter",
            version="1.0.0",
            author="NexusVision",
            description="Counts vehicles per zone with configurable time windows",
            category="counting",
            config_schema={
                "time_window_seconds": {"type": "integer", "default": 60},
                "vehicle_classes": {"type": "array", "default": ["car", "truck", "bus", "motorcycle"]},
            },
        )

    def initialize(self, config: Dict[str, Any]) -> None:
        self._time_window = config.get("time_window_seconds", 60)
        self._vehicle_classes = config.get("vehicle_classes", ["car", "truck", "bus", "motorcycle"])
        self._window_start = time.time()

    def process_frame(self, frame_data: Dict[str, Any]) -> Optional[PluginResult]:
        return None

    def process_event(self, event: Dict[str, Any]) -> Optional[PluginResult]:
        event_type = event.get("event_type", "")
        zone_id = event.get("zone_id", "")
        class_name = event.get("class_name", "")

        if event_type == "ENTERED" and class_name in self._vehicle_classes:
            self._counts[zone_id][class_name] += 1

        now = time.time()
        if now - self._window_start >= self._time_window:
            result = PluginResult(
                plugin_name="vehicle_counter",
                timestamp=now,
                data=dict(self._counts),
                metrics={
                    "total_count": sum(sum(v.values()) for v in self._counts.values()),
                    "zones_tracked": len(self._counts),
                },
            )
            self._counts.clear()
            self._window_start = now
            return result

        return None

    def get_results(self) -> List[PluginResult]:
        return []
