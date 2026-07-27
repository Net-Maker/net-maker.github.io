#!/usr/bin/env python3
"""Export a compact Dynamic3DGaussians frame for the homepage Three.js hero.

The binary layout is intentionally tiny and dependency-free in the browser:
  4 bytes  magic (D3DG)
  5 x u32  version, point_count, joint_count, edge_count, bone_count
  N x 3 f32 point positions
  N x 3 u8  point RGB, padded to a 4-byte boundary
  J x 3 f32 joint positions
  E x 2 u16 skeleton edges
  B x 3 f32 free-form bone positions
  B x 3 x 3 f32 free-form bone rotations
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import numpy as np


DEFAULT_EXPERIMENT = Path(
    "/home/ubuntu/research/GA/Dynamic3DGaussians/output/actorshq_exp2_raw800/"
    "actorshq_actor01_seq1_raw580_800f"
)


def read_ascii_vertex_ply(path: Path) -> tuple[np.ndarray, np.ndarray]:
    header_lines: list[str] = []
    with path.open("rb") as stream:
        while True:
            line = stream.readline()
            if not line:
                raise ValueError(f"PLY header is incomplete: {path}")
            decoded = line.decode("ascii").strip()
            header_lines.append(decoded)
            if decoded == "end_header":
                header_bytes = stream.tell()
                break

    if "format ascii 1.0" not in header_lines:
        raise ValueError(f"Expected an ASCII PLY: {path}")
    vertex_line = next(line for line in header_lines if line.startswith("element vertex "))
    vertex_count = int(vertex_line.rsplit(" ", 1)[1])
    values = np.loadtxt(path, dtype=np.float32, skiprows=len(header_lines), max_rows=vertex_count)
    if values.shape != (vertex_count, 6):
        raise ValueError(f"Expected xyzrgb vertices, received {values.shape} from {path}")
    del header_bytes
    return values[:, :3], np.clip(values[:, 3:6], 0, 255).astype(np.uint8)


def export_asset(
    experiment: Path, frame: int, point_count: int, ssdr_name: str, output: Path
) -> None:
    ply_path = experiment / f"pointcloud_t{frame:03d}.ply"
    motion_path = experiment / "inner_skeleton/skeleton_motion/skeleton_motion.npz"
    ssdr_path = experiment / ssdr_name
    positions, colors = read_ascii_vertex_ply(ply_path)
    source_point_count = len(positions)
    motion = np.load(motion_path, allow_pickle=False)
    joints = np.asarray(motion["joint_positions"][frame], dtype="<f4")
    edges = np.asarray(motion["edges"], dtype="<u2")
    ssdr = np.load(ssdr_path, allow_pickle=False)
    bone_positions = np.asarray(ssdr["bone_positions"][frame], dtype="<f4")
    bone_rotations = np.asarray(ssdr["transformations"][frame, :, :3, :3], dtype="<f4")

    if point_count > len(positions):
        raise ValueError(f"Requested {point_count} points from a cloud containing {len(positions)}")
    rng = np.random.default_rng(20260722)
    indices = np.sort(rng.choice(len(positions), size=point_count, replace=False))
    positions = np.asarray(positions[indices], dtype="<f4")
    colors = np.asarray(colors[indices], dtype=np.uint8)

    output.parent.mkdir(parents=True, exist_ok=True)
    header = struct.pack(
        "<4sIIIII", b"D3DG", 2, len(positions), len(joints), len(edges), len(bone_positions)
    )
    color_bytes = colors.tobytes(order="C")
    color_padding = b"\0" * ((4 - len(color_bytes) % 4) % 4)
    with output.open("wb") as stream:
        stream.write(header)
        stream.write(positions.tobytes(order="C"))
        stream.write(color_bytes)
        stream.write(color_padding)
        stream.write(joints.tobytes(order="C"))
        stream.write(edges.tobytes(order="C"))
        stream.write(bone_positions.tobytes(order="C"))
        stream.write(bone_rotations.tobytes(order="C"))

    bounds_min = positions.min(axis=0)
    bounds_max = positions.max(axis=0)
    metadata = {
        "format": "D3DG homepage actor asset v2",
        "source_repository": "Dynamic3DGaussians",
        "source_dataset": "ActorsHQ actor01 sequence 1",
        "source_experiment": experiment.name,
        "source_pointcloud": ply_path.name,
        "source_skeleton_motion": "inner_skeleton/skeleton_motion/skeleton_motion.npz",
        "source_free_form_bones": ssdr_path.name,
        "frame": frame,
        "source_point_count": int(source_point_count),
        "exported_point_count": int(len(positions)),
        "joint_count": int(len(joints)),
        "edge_count": int(len(edges)),
        "free_form_bone_count": int(len(bone_positions)),
        "bounds": {"min": bounds_min.tolist(), "max": bounds_max.tolist()},
        "sampling_seed": 20260722,
        "binary_file": output.name,
    }
    output.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote {output} ({output.stat().st_size / 1024:.1f} KiB)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment", type=Path, default=DEFAULT_EXPERIMENT)
    parser.add_argument("--frame", type=int, default=150)
    parser.add_argument("--point-count", type=int, default=42_000)
    parser.add_argument(
        "--ssdr-name",
        default="ssdr_results_bones50_15bones_backup_before_threshold3_20260622_142317.npz",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("static/assets/actor01-frame150.d3dg"),
    )
    args = parser.parse_args()
    export_asset(args.experiment, args.frame, args.point_count, args.ssdr_name, args.output)


if __name__ == "__main__":
    main()
