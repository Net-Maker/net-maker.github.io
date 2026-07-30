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

Version 4 optionally appends method-visualization data:
  N x 3 u8  skinning RGB, padded to a 4-byte boundary
  N x 3 f32 curve-contracted point positions
  2 x u32    curve_point_count, curve_edge_count
  C x 3 f32  posed curve skeleton points
  CE x 2 u16 curve skeleton edges
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


def nearest_indices_chunked(
    query: np.ndarray,
    target: np.ndarray,
    chunk_size: int = 8192,
) -> np.ndarray:
    """Match the existing reconstruction-story nearest-point assignment."""
    query = np.asarray(query, dtype=np.float32)
    target = np.asarray(target, dtype=np.float32)
    indices = np.empty(len(query), dtype=np.int32)
    target_squared = np.sum(target * target, axis=1)[None, :]
    for start in range(0, len(query), chunk_size):
        end = min(start + chunk_size, len(query))
        points = query[start:end]
        distances_squared = (
            np.sum(points * points, axis=1)[:, None]
            + target_squared
            - 2.0 * (points @ target.T)
        )
        indices[start:end] = np.argmin(distances_squared, axis=1).astype(np.int32)
    return indices


def lbs_deform(
    points: np.ndarray,
    weights: np.ndarray,
    transforms: np.ndarray,
) -> np.ndarray:
    """Pose the canonical curve exactly as the reconstruction-story renderer does."""
    points_homogeneous = np.c_[
        np.asarray(points, dtype=np.float32),
        np.ones(len(points), dtype=np.float32),
    ]
    posed = np.einsum(
        "bj,jkl,bl->bk",
        np.asarray(weights, dtype=np.float32),
        np.asarray(transforms, dtype=np.float32),
        points_homogeneous,
    )
    return np.asarray(posed[:, :3], dtype="<f4")


def project_to_curve_segments(
    points: np.ndarray,
    curve_points: np.ndarray,
    curve_edges: np.ndarray,
) -> np.ndarray:
    """Project geometry onto the nearest segment of an extracted curve skeleton."""
    projected = np.empty_like(points, dtype=np.float32)
    best_distances = np.full(len(points), np.inf, dtype=np.float32)
    for start_index, end_index in curve_edges:
        start = curve_points[start_index]
        delta = curve_points[end_index] - start
        length_squared = max(float(np.dot(delta, delta)), 1e-8)
        parameter = np.clip(((points - start) @ delta) / length_squared, 0.0, 1.0)
        candidate = start + parameter[:, None] * delta
        distance = np.sum((points - candidate) ** 2, axis=1)
        closer = distance < best_distances
        projected[closer] = candidate[closer]
        best_distances[closer] = distance[closer]
    return np.asarray(projected, dtype="<f4")


def export_asset(
    experiment: Path,
    frame: int,
    point_count: int,
    ssdr_name: str,
    output: Path,
    include_method_data: bool,
    skinning_name: str,
    curve_name: str,
    curve_ssdr_name: str,
    curve_points_path: Path | None,
    curve_edges_path: Path | None,
    synchronized_asset_path: Path | None,
) -> None:
    ply_path = experiment / f"pointcloud_t{frame:03d}.ply"
    canonical_ply_path = experiment / "pointcloud_t000.ply"
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
    synchronized_asset = None
    if synchronized_asset_path is not None:
        synchronized_asset = np.load(synchronized_asset_path, allow_pickle=False)
        joints = np.asarray(synchronized_asset["joint_positions"], dtype="<f4")
        edges = np.asarray(synchronized_asset["joint_edges"], dtype="<u2")
        bone_positions = np.asarray(
            synchronized_asset["free_form_bone_positions"],
            dtype="<f4",
        )
        bone_rotations = np.asarray(
            synchronized_asset["free_form_bone_rotations"],
            dtype="<f4",
        )

    if point_count > len(positions):
        raise ValueError(f"Requested {point_count} points from a cloud containing {len(positions)}")
    rng = np.random.default_rng(20260722)
    indices = np.sort(rng.choice(len(positions), size=point_count, replace=False))
    positions = np.asarray(positions[indices], dtype="<f4")
    colors = np.asarray(colors[indices], dtype=np.uint8)

    skinning_colors = None
    projected_positions = None
    curve_points = None
    curve_edges = None
    if include_method_data:
        skinning_path = experiment / skinning_name
        skinning = np.load(skinning_path, allow_pickle=False)
        all_skinning_colors = np.asarray(skinning["skinning_rgb_u8"], dtype=np.uint8)
        if len(all_skinning_colors) != source_point_count:
            raise ValueError(
                "Skinning assignment and source point cloud must share Gaussian indices: "
                f"{len(all_skinning_colors)} != {source_point_count}"
            )
        skinning_colors = np.asarray(all_skinning_colors[indices], dtype=np.uint8)

        if (curve_points_path is None) != (curve_edges_path is None):
            raise ValueError(
                "--curve-points-path and --curve-edges-path must be supplied together"
            )

        if synchronized_asset is not None:
            curve_points = np.asarray(
                synchronized_asset["curve_points"],
                dtype="<f4",
            )
            curve_edges = np.asarray(
                synchronized_asset["curve_edges"],
                dtype="<u2",
            )
            projected_positions = project_to_curve_segments(
                positions,
                curve_points,
                curve_edges,
            )
            curve_source = synchronized_asset_path.name
            curve_motion_source = None
            curve_pose_method = (
                "20k MCF with original-volume constraint and "
                "topology-complete skinning-joint compression"
            )
            curve_correspondence = "nearest segment projection in the matching pose"
        elif curve_points_path is not None and curve_edges_path is not None:
            curve_points = np.asarray(
                np.loadtxt(curve_points_path, dtype=np.float32),
                dtype="<f4",
            )
            curve_edges = np.asarray(
                np.loadtxt(curve_edges_path, dtype=np.int32).reshape(-1, 2),
                dtype="<u2",
            )
            projected_positions = project_to_curve_segments(
                positions,
                curve_points,
                curve_edges,
            )
            curve_source = str(curve_points_path.parent)
            curve_motion_source = None
            if "topology_refit" in curve_points_path.parent.name:
                curve_pose_method = (
                    "Q-MAT-constrained source-tree-preserving centerline refit "
                    f"from matching frame {frame}"
                )
            else:
                curve_pose_method = (
                    f"direct curve-skeleton extraction from matching frame {frame}"
                )
            curve_correspondence = "nearest segment projection in the matching pose"
        else:
            curve_path = experiment / curve_name
            curve_ssdr_path = experiment / curve_ssdr_name
            canonical_positions, _ = read_ascii_vertex_ply(canonical_ply_path)
            if len(canonical_positions) != source_point_count:
                raise ValueError(
                    "Canonical and posed point clouds must share Gaussian indices: "
                    f"{len(canonical_positions)} != {source_point_count}"
                )

            curve = np.load(curve_path, allow_pickle=False)
            canonical_curve_points = np.asarray(curve["points"], dtype=np.float32)
            curve_edges = np.asarray(curve["edges"], dtype="<u2")
            curve_weights = np.asarray(curve["weights"], dtype=np.float32)
            curve_ssdr = np.load(curve_ssdr_path, allow_pickle=False)
            curve_transforms = np.asarray(
                curve_ssdr["transformations"][frame],
                dtype=np.float32,
            )
            if curve_weights.shape[1] != len(curve_transforms):
                raise ValueError(
                    "Curve skinning weights and SSDR transforms must share the bone dimension: "
                    f"{curve_weights.shape[1]} != {len(curve_transforms)}"
                )
            curve_points = lbs_deform(
                canonical_curve_points,
                curve_weights,
                curve_transforms,
            )
            canonical_curve_indices = nearest_indices_chunked(
                canonical_positions,
                canonical_curve_points,
            )
            projected_positions = np.asarray(
                curve_points[canonical_curve_indices[indices]],
                dtype="<f4",
            )
            curve_source = curve_name
            curve_motion_source = curve_ssdr_name
            curve_pose_method = "SSDR linear blend skinning"
            curve_correspondence = (
                "nearest canonical curve point at frame 0, matching "
                "render_actor01_reconstruction_story_raster.py"
            )

    output.parent.mkdir(parents=True, exist_ok=True)
    version = 4 if include_method_data else 2
    header = struct.pack(
        "<4sIIIII", b"D3DG", version, len(positions), len(joints), len(edges), len(bone_positions)
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
        if include_method_data:
            skinning_bytes = skinning_colors.tobytes(order="C")
            skinning_padding = b"\0" * ((4 - len(skinning_bytes) % 4) % 4)
            stream.write(skinning_bytes)
            stream.write(skinning_padding)
            stream.write(projected_positions.tobytes(order="C"))
            stream.write(struct.pack("<II", len(curve_points), len(curve_edges)))
            stream.write(curve_points.tobytes(order="C"))
            stream.write(curve_edges.tobytes(order="C"))

    bounds_min = positions.min(axis=0)
    bounds_max = positions.max(axis=0)
    metadata = {
        "format": f"D3DG actor asset v{version}",
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
    if synchronized_asset is not None:
        joint_degree = np.bincount(edges.ravel(), minlength=len(joints))
        metadata.update(
            {
                "source_skeleton_motion": synchronized_asset_path.name,
                "source_synchronized_skelebones": synchronized_asset_path.name,
                "kinematic_tree_leaf_count": int(np.count_nonzero(joint_degree == 1)),
                "kinematic_tree_cycle_rank": int(len(edges) - len(joints) + 1),
                "outer_to_inner_binding": "nearest segment on rebuilt kinematic tree",
            }
        )
    if include_method_data:
        metadata.update(
            {
                "source_skinning_assignment": skinning_name,
                "source_curve_skeleton": curve_source,
                "source_curve_motion": curve_motion_source,
                "method_data": [
                    "skinning_rgb",
                    "curve_contracted_positions",
                    "posed_curve_skeleton",
                ],
                "curve_point_count": int(len(curve_points)),
                "curve_edge_count": int(len(curve_edges)),
                "curve_pose_frame": frame,
                "curve_pose_method": curve_pose_method,
                "curve_correspondence": curve_correspondence,
            }
        )
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
    parser.add_argument("--include-method-data", action="store_true")
    parser.add_argument(
        "--skinning-name",
        default="threshold3_single_skinning_plys/metadata/"
        "gaussian_skinning_assignment_threshold3.npz",
    )
    parser.add_argument(
        "--curve-name",
        default="curve_skinning/curve_skeleton_skinning_weights.npz",
    )
    parser.add_argument(
        "--curve-ssdr-name",
        default="ssdr_results_bones50.npz",
        help="SSDR transforms paired with the curve skeleton's skinning weights.",
    )
    parser.add_argument(
        "--curve-points-path",
        type=Path,
        default=None,
        help="Points from a curve skeleton extracted directly in the requested pose.",
    )
    parser.add_argument(
        "--curve-edges-path",
        type=Path,
        default=None,
        help="Edges paired with --curve-points-path.",
    )
    parser.add_argument(
        "--synchronized-asset",
        type=Path,
        default=None,
        help=(
            "NPZ containing a matching curve, kinematic tree, and free-form bones. "
            "When supplied, it overrides the independent skeleton sources."
        ),
    )
    args = parser.parse_args()
    export_asset(
        args.experiment,
        args.frame,
        args.point_count,
        args.ssdr_name,
        args.output,
        args.include_method_data,
        args.skinning_name,
        args.curve_name,
        args.curve_ssdr_name,
        args.curve_points_path,
        args.curve_edges_path,
        args.synchronized_asset,
    )


if __name__ == "__main__":
    main()
