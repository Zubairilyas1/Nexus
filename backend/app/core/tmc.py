"""Turning Movement Count (TMC) CSV generator for traffic operations."""

import csv
import io
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict
from dataclasses import dataclass


@dataclass
class TMCRecord:
    """Single vehicle crossing event for TMC."""
    timestamp: datetime
    approach: str          # e.g., "NB", "SB", "EB", "WB"
    movement: str          # e.g., "left", "through", "right", "uturn"
    vehicle_class: str     # e.g., "car", "truck", "bus", "motorcycle", "pedestrian", "bicycle"
    track_id: int
    zone_id: str


class TMCGenerator:
    """
    Generate 15-minute binned Turning Movement Counts from zone events.
    
    Expected zone naming convention: "{approach}_{movement}"
    e.g., "NB_left", "SB_through", "EB_right", "WB_uturn"
    """
    
    VALID_APPROACHES = {"NB", "SB", "EB", "WB"}
    VALID_MOVEMENTS = {"left", "through", "right", "uturn"}
    CLASS_MAP = {
        "car": "car",
        "truck": "truck", 
        "bus": "bus",
        "motorcycle": "motorcycle",
        "bicycle": "bicycle",
        "pedestrian": "pedestrian",
        "person": "pedestrian",
    }
    
    def __init__(self, bin_minutes: int = 15):
        self.bin_minutes = bin_minutes
        self.records: List[TMCRecord] = []
    
    def add_event(
        self,
        timestamp: datetime,
        zone_id: str,
        vehicle_class: str,
        track_id: int,
    ) -> None:
        """Add a zone crossing event (only 'entered' events should be passed)."""
        approach, movement = self._parse_zone_id(zone_id)
        if approach is None:
            return
        
        vclass = self.CLASS_MAP.get(vehicle_class.lower(), "car")
        
        self.records.append(TMCRecord(
            timestamp=timestamp,
            approach=approach,
            movement=movement,
            vehicle_class=vclass,
            track_id=track_id,
            zone_id=zone_id,
        ))
    
    def _parse_zone_id(self, zone_id: str) -> tuple:
        """Parse zone_id like 'NB_left' into ('NB', 'left')."""
        parts = zone_id.split("_")
        if len(parts) != 2:
            return None, None
        approach, movement = parts[0].upper(), parts[1].lower()
        if approach not in self.VALID_APPROACHES:
            return None, None
        if movement not in self.VALID_MOVEMENTS:
            return None, None
        return approach, movement
    
    def _bin_timestamp(self, ts: datetime) -> datetime:
        """Round down to nearest bin_minutes interval."""
        minute = (ts.minute // self.bin_minutes) * self.bin_minutes
        return ts.replace(minute=minute, second=0, microsecond=0)
    
    def generate_csv(self, output_path: Optional[str] = None) -> str:
        """
        Generate TMC CSV with 15-min bins.
        
        Columns: interval_start, approach, movement, car, truck, bus, motorcycle, pedestrian, bicycle
        """
        if not self.records:
            return ""
        
        # Aggregate counts per bin
        bins: Dict[datetime, Dict[str, Dict[str, Dict[str, int]]]] = defaultdict(
            lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
        )
        
        for r in self.records:
            bin_ts = self._bin_timestamp(r.timestamp)
            bins[bin_ts][r.approach][r.movement][r.vehicle_class] += 1
        
        # Build rows
        rows = []
        for bin_ts in sorted(bins.keys()):
            for approach in sorted(bins[bin_ts].keys()):
                for movement in sorted(bins[bin_ts][approach].keys()):
                    counts = bins[bin_ts][approach][movement]
                    row = {
                        "interval_start": bin_ts.isoformat(),
                        "approach": approach,
                        "movement": movement,
                        "car": counts.get("car", 0),
                        "truck": counts.get("truck", 0),
                        "bus": counts.get("bus", 0),
                        "motorcycle": counts.get("motorcycle", 0),
                        "pedestrian": counts.get("pedestrian", 0),
                        "bicycle": counts.get("bicycle", 0),
                    }
                    rows.append(row)
        
        # Write CSV
        output = io.StringIO()
        fieldnames = [
            "interval_start", "approach", "movement",
            "car", "truck", "bus", "motorcycle", "pedestrian", "bicycle"
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
        
        csv_str = output.getvalue()
        
        if output_path:
            Path(output_path).write_text(csv_str)
        
        return csv_str
    
    def generate_summary(self) -> str:
        """Human-readable summary."""
        if not self.records:
            return "No records"
        
        total = len(self.records)
        by_class = defaultdict(int)
        by_approach = defaultdict(int)
        
        for r in self.records:
            by_class[r.vehicle_class] += 1
            by_approach[r.approach] += 1
        
        lines = [
            f"TMC Summary: {total} total crossings",
            f"By class: {dict(by_class)}",
            f"By approach: {dict(by_approach)}",
            f"Time range: {min(r.timestamp for r in self.records)} to {max(r.timestamp for r in self.records)}",
        ]
        return "\n".join(lines)
    
    def clear(self):
        self.records.clear()


def demo():
    """Quick self-test."""
    from datetime import datetime
    
    gen = TMCGenerator(bin_minutes=15)
    base = datetime(2024, 1, 15, 8, 0, 0)
    
    # Simulate events
    gen.add_event(base + timedelta(minutes=2), "NB_left", "car", 1)
    gen.add_event(base + timedelta(minutes=5), "NB_left", "truck", 2)
    gen.add_event(base + timedelta(minutes=17), "NB_left", "car", 3)  # next bin
    gen.add_event(base + timedelta(minutes=3), "SB_through", "car", 4)
    gen.add_event(base + timedelta(minutes=4), "SB_through", "pedestrian", 5)
    
    print(gen.generate_summary())
    print("\n--- CSV ---")
    print(gen.generate_csv())


if __name__ == "__main__":
    demo()