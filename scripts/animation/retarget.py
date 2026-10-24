#!/usr/bin/env python3
"""Retarget animation clips from CC0 library rigs onto the Terminus XI hero rig.

All five painted heroes share one 22-joint skeleton (same names, same
hierarchy; only bone lengths differ), so one armature-only GLB of clips serves
the whole party. This script builds that file.

    python3 -I scripts/animation/retarget.py \
        --target public/assets/models/bacchus.glb \
        --source work/kaykit/Rig_Medium_Animations.glb --map auto --clips Running_A,Hit_A \
        --source work/quaternius/UAL_Standard.glb --map mixamo --reference-clip TPose --clips Spell_Simple_Shoot \
        --out public/assets/animations/hero-animations.glb \
        --receipt public/assets/animations/hero-animations.json

Method: for every sampled frame, each mapped target bone receives the source
bone's world-space rotation *change from its reference pose*, applied to the
target bone's own rest orientation:

    R_target(t) = R_source(t) · R_source_ref⁻¹ · R_target_rest

Both rigs are expected in a T-pose reference. The hero bind pose is a T-pose;
for a library whose rest pose is not, pass --reference-clip naming its T-pose
clip. Hips translation is kept vertical only (scaled by hip height) so the
combat kernel remains the sole authority over where a character stands.

Requires Blender as a Python module (pip install bpy) or run inside Blender:
    blender -b -P scripts/animation/retarget.py -- <args>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time

import bpy  # type: ignore
from mathutils import Matrix, Quaternion, Vector  # type: ignore

CANONICAL = [
    'hips', 'spine', 'chest', 'upper_chest', 'neck', 'head',
    'clavicle_L', 'upper_arm_L', 'forearm_L', 'hand_L',
    'clavicle_R', 'upper_arm_R', 'forearm_R', 'hand_R',
    'thigh_L', 'shin_L', 'foot_L', 'toe_L',
    'thigh_R', 'shin_R', 'foot_R', 'toe_R',
]

# Mixamo-style names (Quaternius Universal Animation Library uses these without the prefix).
MIXAMO = {
    'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine1', 'upper_chest': 'Spine2', 'neck': 'Neck', 'head': 'Head',
    'clavicle_L': 'LeftShoulder', 'upper_arm_L': 'LeftArm', 'forearm_L': 'LeftForeArm', 'hand_L': 'LeftHand',
    'clavicle_R': 'RightShoulder', 'upper_arm_R': 'RightArm', 'forearm_R': 'RightForeArm', 'hand_R': 'RightHand',
    'thigh_L': 'LeftUpLeg', 'shin_L': 'LeftLeg', 'foot_L': 'LeftFoot', 'toe_L': 'LeftToeBase',
    'thigh_R': 'RightUpLeg', 'shin_R': 'RightLeg', 'foot_R': 'RightFoot', 'toe_R': 'RightToeBase',
}

# Rigify deform bones (Quaternius Universal Animation Library uses these).
RIGIFY = {
    'hips': 'DEF-hips', 'spine': 'DEF-spine.001', 'chest': 'DEF-spine.002', 'upper_chest': 'DEF-spine.003', 'neck': 'DEF-neck', 'head': 'DEF-head',
    'clavicle_L': 'DEF-shoulder.L', 'upper_arm_L': 'DEF-upper_arm.L', 'forearm_L': 'DEF-forearm.L', 'hand_L': 'DEF-hand.L',
    'clavicle_R': 'DEF-shoulder.R', 'upper_arm_R': 'DEF-upper_arm.R', 'forearm_R': 'DEF-forearm.R', 'hand_R': 'DEF-hand.R',
    'thigh_L': 'DEF-thigh.L', 'shin_L': 'DEF-shin.L', 'foot_L': 'DEF-foot.L', 'toe_L': 'DEF-toe.L',
    'thigh_R': 'DEF-thigh.R', 'shin_R': 'DEF-shin.R', 'foot_R': 'DEF-foot.R', 'toe_R': 'DEF-toe.R',
}

# Synonyms for the heuristic matcher. Matching is done on a normalized name:
# lowercase, prefixes like "mixamorig:" removed, separators removed, with the
# side detected from l/r/left/right tokens. Unmatched bones are reported.
SYNONYMS = {
    'hips': ['hips', 'pelvis', 'hip'],
    'spine': ['spine', 'spine01', 'spine1', 'lowerspine', 'abdomen', 'body'],
    'chest': ['spine1', 'spine02', 'spine2', 'chest', 'torso'],
    'upper_chest': ['spine2', 'spine03', 'spine3', 'upperchest', 'chestupper'],
    'neck': ['neck', 'neck01'],
    'head': ['head'],
    'clavicle': ['shoulder', 'clavicle', 'collar'],
    'upper_arm': ['arm', 'upperarm', 'armupper', 'upperarm01', 'bicep'],
    'forearm': ['forearm', 'lowerarm', 'armlower', 'elbow'],
    'hand': ['hand', 'wrist'],
    'thigh': ['upleg', 'thigh', 'upperleg', 'legupper'],
    'shin': ['leg', 'shin', 'lowerleg', 'leglower', 'calf', 'knee'],
    'foot': ['foot', 'ankle'],
    'toe': ['toebase', 'toe', 'toes', 'ball'],
}


def log(*parts):
    print('[retarget]', *parts, flush=True)


def reset_scene(fps: int):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # The module build can keep orphan datablocks across a factory reset; purge them
    # so clip names never pick up .001 suffixes between passes.
    for collection in (bpy.data.actions, bpy.data.objects, bpy.data.armatures, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        bpy.data.batch_remove(list(collection))
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.render.fps_base = 1.0


def import_glb(path: str):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    armatures = [o for o in added if o.type == 'ARMATURE']
    if not armatures:
        raise SystemExit(f'{path}: no armature found')
    actions_before = set()
    return added, armatures[0]


def normalize(name: str) -> str:
    n = name.lower()
    for prefix in ('mixamorig:', 'mixamorig', 'armature|', 'rig|', 'def-', 'def_'):
        if n.startswith(prefix):
            n = n[len(prefix):]
    return ''.join(ch for ch in n if ch.isalnum())


def detect_side(name: str):
    n = name.lower()
    tokens = [t for t in n.replace('-', '_').replace('.', '_').replace(':', '_').split('_') if t]
    if any(t in ('l', 'left') for t in tokens) or n.startswith('left') or n.endswith('.l') or n.endswith('_l'):
        return 'L'
    if any(t in ('r', 'right') for t in tokens) or n.startswith('right') or n.endswith('.r') or n.endswith('_r'):
        return 'R'
    return None


def auto_map(source_bones: list[str]) -> dict[str, str]:
    """Best-effort map canonical -> source bone name by synonyms and side."""
    result: dict[str, str] = {}
    used: set[str] = set()
    for canon in CANONICAL:
        base, _, side = canon.partition('_') if canon.count('_') == 1 and canon[-1] in 'LR' else (canon, '', '')
        if canon in ('upper_arm_L', 'upper_arm_R', 'upper_chest'):
            base, side = ('upper_arm', canon[-1]) if canon != 'upper_chest' else ('upper_chest', '')
        keys = SYNONYMS[base]
        best = None
        for bone in source_bones:
            if bone in used:
                continue
            n = normalize(bone)
            s = detect_side(bone)
            if side and s != side:
                continue
            if not side and s:
                continue
            core = n
            for tok in ('left', 'right'):
                core = core.replace(tok, '')
            core = core.rstrip('lr') if side else core
            for key in keys:
                if core == key or core.endswith(key) or core.startswith(key):
                    if best is None or len(n) < len(normalize(best)):
                        best = bone
        if best:
            result[canon] = best
            used.add(best)
    return result


def build_map(kind: str, source_bones: list[str]) -> dict[str, str]:
    if kind == 'rigify':
        have = set(source_bones)
        return {canon: name for canon, name in RIGIFY.items() if name in have}
    if kind == 'mixamo':
        names = {normalize(b): b for b in source_bones}
        out = {}
        for canon, mix in MIXAMO.items():
            key = normalize(mix)
            if key in names:
                out[canon] = names[key]
        return out
    return auto_map(source_bones)


def world_rest(arm, bone_name: str) -> Matrix:
    return arm.matrix_world @ arm.data.bones[bone_name].matrix_local


def pose_world(arm, bone_name: str) -> Matrix:
    return arm.matrix_world @ arm.pose.bones[bone_name].matrix


def set_action(arm, action):
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    # Blender 4.4+ layered actions need a slot assignment.
    if hasattr(action, 'slots') and len(action.slots) and hasattr(arm.animation_data, 'action_slot'):
        try:
            arm.animation_data.action_slot = action.slots[0]
        except Exception:  # pragma: no cover - older API
            pass


def evaluate(scene, frame: float):
    scene.frame_set(int(math.floor(frame)), subframe=frame - math.floor(frame))
    bpy.context.view_layer.update()


def reference_rotations(scene, src_arm, source_action, reference_action, names: list[str]):
    """World rotations of the source bones in the reference (T) pose."""
    if reference_action is not None:
        set_action(src_arm, reference_action)
        evaluate(scene, reference_action.frame_range[0])
        rots = {n: pose_world(src_arm, n).to_quaternion() for n in names}
        hip_z = pose_world(src_arm, names[0]).to_translation().z if names else 0.0
        set_action(src_arm, source_action)
        return rots, hip_z
    rots = {n: world_rest(src_arm, n).to_quaternion() for n in names}
    hip_z = world_rest(src_arm, names[0]).to_translation().z if names else 0.0
    return rots, hip_z


def retarget_clip(scene, src_arm, source_action, tgt_arm, bone_map: dict[str, str], out_name: str,
                  fps: int, reference_action=None, keep_vertical=True):
    """Create a new action on tgt_arm from source_action. Returns (action, frames, warnings)."""
    tgt_bones = {b.name: b for b in tgt_arm.data.bones}
    order = [n for n in CANONICAL if n in tgt_bones]  # parents before children in CANONICAL
    mapped = {k: v for k, v in bone_map.items() if k in tgt_bones and v in src_arm.pose.bones}
    src_names = [mapped[k] for k in order if k in mapped]
    ref_rot, src_hip_ref_z = reference_rotations(scene, src_arm, source_action, reference_action, src_names)
    tgt_rest = {n: world_rest(tgt_arm, n) for n in order}
    tgt_rest_rot = {n: tgt_rest[n].to_quaternion() for n in order}
    tgt_hip_z = tgt_rest['hips'].to_translation().z if 'hips' in tgt_rest else 1.0
    hip_scale = (tgt_hip_z / src_hip_ref_z) if src_hip_ref_z > 1e-6 else 1.0

    # The output keeps the clean name; a same-named source action steps aside.
    if out_name in bpy.data.actions and bpy.data.actions[out_name] is not source_action:
        bpy.data.actions[out_name].name = f'source:{out_name}'
    if source_action.name == out_name:
        source_action.name = f'source:{out_name}'
    action = bpy.data.actions.new(out_name)
    set_action(tgt_arm, action)
    for pb in tgt_arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.location = Vector((0, 0, 0))

    start, end = source_action.frame_range
    frames = list(range(int(math.floor(start)), int(math.ceil(end)) + 1))
    if len(frames) < 2:
        frames = [int(start), int(start) + 1]
    set_action(src_arm, source_action)
    parent_of = {n: (tgt_bones[n].parent.name if tgt_bones[n].parent else None) for n in order}
    posed: dict[str, Matrix] = {}
    for i, frame in enumerate(frames):
        evaluate(scene, frame)
        posed.clear()
        for n in order:
            rest = tgt_rest[n]
            parent = parent_of[n]
            if parent is None:
                chain = rest.copy()
            else:
                chain = posed[parent] @ (tgt_rest[parent].inverted() @ rest)
            if n in mapped:
                s = mapped[n]
                rs = pose_world(src_arm, s).to_quaternion()
                desired_rot = rs @ ref_rot[s].inverted() @ tgt_rest_rot[n]
                desired = Matrix.Translation(chain.to_translation()) @ desired_rot.to_matrix().to_4x4()
            else:
                desired = chain
            if n == 'hips' and keep_vertical and 'hips' in mapped:
                dz = (pose_world(src_arm, mapped['hips']).to_translation().z - src_hip_ref_z) * hip_scale
                desired = Matrix.Translation(Vector((0, 0, dz))) @ desired
            posed[n] = desired
            basis = chain.inverted() @ desired
            pb = tgt_arm.pose.bones[n]
            q = basis.to_quaternion().normalized()
            # keep quaternion continuity for clean interpolation
            if i > 0 and q.dot(pb.rotation_quaternion) < 0:
                q.negate()
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=i, group=n)
            if n == 'hips':
                pb.location = basis.to_translation()
                pb.keyframe_insert('location', frame=i, group=n)
    # Blender needs the target rest restored for the next clip.
    set_action(tgt_arm, None)
    for pb in tgt_arm.pose.bones:
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0)); pb.location = Vector((0, 0, 0))
    return action, len(frames)


def clear_target_animation(tgt_arm, keep=()):
    """Drop the hero file's own tracks and actions; the library carries only retargeted clips."""
    keep_ids = {id(a) for a in keep}
    if tgt_arm.animation_data:
        for track in list(tgt_arm.animation_data.nla_tracks):
            tgt_arm.animation_data.nla_tracks.remove(track)
        tgt_arm.animation_data.action = None
    for a in list(bpy.data.actions):
        if id(a) not in keep_ids:
            bpy.data.actions.remove(a)


def push_to_nla(tgt_arm, actions):
    if tgt_arm.animation_data is None:
        tgt_arm.animation_data_create()
    tgt_arm.animation_data.action = None
    for action in actions:
        track = tgt_arm.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.name = action.name


def export_armature(tgt_arm, path: str):
    for o in list(bpy.data.objects):
        if o is not tgt_arm:
            bpy.data.objects.remove(o, do_unlink=True)
    # Pure armature export: a tiny skinned triangle keeps every exporter version
    # emitting the full joint hierarchy; the game never renders it.
    mesh = bpy.data.meshes.new('rig-anchor')
    mesh.from_pydata([(0, 0, 0), (0.001, 0, 0), (0, 0.001, 0)], [], [(0, 1, 2)])
    anchor = bpy.data.objects.new('rig-anchor', mesh)
    bpy.context.scene.collection.objects.link(anchor)
    anchor.parent = tgt_arm
    mod = anchor.modifiers.new('Armature', 'ARMATURE'); mod.object = tgt_arm
    group = anchor.vertex_groups.new(name='hips'); group.add([0, 1, 2], 1.0, 'REPLACE')
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = tgt_arm
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_nla_strips=True,
        export_force_sampling=True, export_optimize_animation_size=True,
        export_skins=True, export_morph=False, export_materials='NONE', export_yup=True,
        export_apply=False, export_texcoords=False, export_normals=False,
    )


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Self-test: a synthetic Mixamo-named source rig with different proportions and
# an A-pose rest, animated procedurally, so the maths can be checked without
# the CC0 kits present.

def build_synthetic_source(scene, fps: int):
    arm_data = bpy.data.armatures.new('Synthetic')
    arm = bpy.data.objects.new('SyntheticRig', arm_data)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None):
        b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail)
        if parent: b.parent = eb[parent]
        return b
    # Taller, longer-armed than the hero; arms in A-pose (45° down).
    bone('Hips', (0, 0, 1.1), (0, 0, 1.22))
    bone('Spine', (0, 0, 1.22), (0, 0, 1.36), 'Hips')
    bone('Spine1', (0, 0, 1.36), (0, 0, 1.5), 'Spine')
    bone('Spine2', (0, 0, 1.5), (0, 0, 1.62), 'Spine1')
    bone('Neck', (0, 0, 1.62), (0, 0, 1.72), 'Spine2')
    bone('Head', (0, 0, 1.72), (0, 0, 1.95), 'Neck')
    for side, sx in (('Left', 1), ('Right', -1)):
        bone(f'{side}Shoulder', (0, 0, 1.6), (sx * .12, 0, 1.6), 'Spine2')
        bone(f'{side}Arm', (sx * .12, 0, 1.6), (sx * .40, 0, 1.32), f'{side}Shoulder')
        bone(f'{side}ForeArm', (sx * .40, 0, 1.32), (sx * .66, 0, 1.06), f'{side}Arm')
        bone(f'{side}Hand', (sx * .66, 0, 1.06), (sx * .76, 0, .96), f'{side}ForeArm')
        bone(f'{side}UpLeg', (sx * .1, 0, 1.1), (sx * .1, 0, .58), 'Hips')
        bone(f'{side}Leg', (sx * .1, 0, .58), (sx * .1, 0, .08), f'{side}UpLeg')
        bone(f'{side}Foot', (sx * .1, 0, .08), (sx * .1, -.15, 0), f'{side}Leg')
        bone(f'{side}ToeBase', (sx * .1, -.15, 0), (sx * .1, -.25, 0), f'{side}Foot')
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    def keyed_action(name, keys):
        action = bpy.data.actions.new(name)
        set_action(arm, action)
        for frame, poses in keys:
            for pb in arm.pose.bones:
                pb.rotation_quaternion = Quaternion((1, 0, 0, 0)); pb.location = (0, 0, 0)
            for bname, (axis, deg) in poses.items():
                arm.pose.bones[bname].rotation_quaternion = Quaternion(Vector(axis), math.radians(deg))
            if 'Hips' in poses and len(poses['Hips']) == 3:
                pass
            for pb in arm.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=frame)
            arm.pose.bones['Hips'].keyframe_insert('location', frame=frame)
        return action
    # T-pose reference: arms raised from A to T is +45° about the forward axis.
    tpose = keyed_action('TPose', [(0, {'LeftArm': ((0, 1, 0), 45), 'RightArm': ((0, 1, 0), -45)})])
    # Wave: from T-pose, right arm swings forward 90° over 1s and spine twists 20°.
    wave = keyed_action('Synthetic_Wave', [
        (0, {'LeftArm': ((0, 1, 0), 45), 'RightArm': ((0, 1, 0), -45)}),
        (fps, {'LeftArm': ((0, 1, 0), 45), 'RightArm': ((0, 1, 0), -45), 'Spine': ((0, 0, 1), 20)}),
    ])
    # Rotate RightArm forward about world X at the end frame as well.
    set_action(arm, wave)
    scene.frame_set(fps)
    arm.pose.bones['RightArm'].rotation_quaternion = Quaternion(Vector((0, 1, 0)), math.radians(-45)) @ Quaternion(Vector((1, 0, 0)), math.radians(90))
    arm.pose.bones['RightArm'].keyframe_insert('rotation_quaternion', frame=fps)
    # Crouch: hips drop 0.25 over half a second.
    crouch = keyed_action('Synthetic_Crouch', [(0, {'LeftArm': ((0, 1, 0), 45), 'RightArm': ((0, 1, 0), -45)}),
                                                (fps // 2, {'LeftArm': ((0, 1, 0), 45), 'RightArm': ((0, 1, 0), -45)})])
    set_action(arm, crouch); scene.frame_set(fps // 2)
    # Hips bone points up world Z, so bone-local -Y is world down.
    arm.pose.bones['Hips'].location = (0, -.25, 0); arm.pose.bones['Hips'].keyframe_insert('location', frame=fps // 2)
    return arm, {'TPose': tpose, 'Synthetic_Wave': wave, 'Synthetic_Crouch': crouch}


def stub_motion(name: str):
    """Procedural placeholder motion for a library clip name, by keyword."""
    n = name.lower()
    # Baseline is the synthetic rig's A-pose (arms 45° down from the T-pose
    # reference), so placeholder clips read as a relaxed stance, not a T-pose.
    def pose(**extra):
        d = {}; d.update(extra); return d
    if 'death' in n:
        return 1.2, [(0, pose()), (.5, pose(Hips=((1, 0, 0), 55), Spine=((1, 0, 0), 20))), (1.0, pose(Hips=((1, 0, 0), 85), Spine=((1, 0, 0), 25)))], -0.9
    if 'hit' in n:
        return .5, [(0, pose()), (.15, pose(Spine=((1, 0, 0), -14), Spine1=((1, 0, 0), -8), Head=((1, 0, 0), -10))), (.5, pose())], 0
    if 'dodge' in n or 'roll' in n:
        return .6, [(0, pose()), (.3, pose(Spine=((1, 0, 0), 25), LeftUpLeg=((1, 0, 0), -40), RightUpLeg=((1, 0, 0), -40), LeftLeg=((1, 0, 0), 60), RightLeg=((1, 0, 0), 60))), (.6, pose())], -0.3
    if 'running' in n or 'jog' in n or 'sprint' in n:
        return .7, [(0, pose(LeftUpLeg=((1, 0, 0), -35), RightUpLeg=((1, 0, 0), 30), LeftLeg=((1, 0, 0), 20), RightLeg=((1, 0, 0), 60), LeftArm=((1, 0, 0), 25), RightArm=((1, 0, 0), -25))),
                    (.35, pose(LeftUpLeg=((1, 0, 0), 30), RightUpLeg=((1, 0, 0), -35), LeftLeg=((1, 0, 0), 60), RightLeg=((1, 0, 0), 20), LeftArm=((1, 0, 0), -25), RightArm=((1, 0, 0), 25))),
                    (.7, pose(LeftUpLeg=((1, 0, 0), -35), RightUpLeg=((1, 0, 0), 30), LeftLeg=((1, 0, 0), 20), RightLeg=((1, 0, 0), 60), LeftArm=((1, 0, 0), 25), RightArm=((1, 0, 0), -25)))], 0
    if 'block' in n:
        return .8, [(0, pose()), (.2, pose(LeftArm=((1, 0, 0), 70), RightArm=((1, 0, 0), 70), LeftForeArm=((0, 0, 1), 60), RightForeArm=((0, 0, 1), -60))), (.8, pose(LeftArm=((1, 0, 0), 70), RightArm=((1, 0, 0), 70)))], 0
    if 'cheer' in n or 'raise' in n or 'summon' in n:
        return 1.0, [(0, pose()), (.4, pose(LeftArm=((0, 1, 0), 120), RightArm=((0, 1, 0), -120))), (1.0, pose())], 0
    if 'bow' in n:
        return .9, [(0, pose(LeftArm=((1, 0, 0), 80), RightArm=((1, 0, 0), 80), RightForeArm=((0, 0, 1), -90))), (.6, pose(LeftArm=((1, 0, 0), 80), RightArm=((1, 0, 0), 80), RightForeArm=((0, 0, 1), -120))), (.9, pose(LeftArm=((1, 0, 0), 80), RightArm=((1, 0, 0), 80)))], 0
    if 'spell' in n or 'magic' in n or 'shoot' in n:
        return 1.0, [(0, pose()), (.4, pose(RightArm=((1, 0, 0), 60), RightForeArm=((0, 0, 1), -70), Spine=((0, 0, 1), -12))), (.6, pose(RightArm=((1, 0, 0), 95), Spine=((0, 0, 1), 10))), (1.0, pose())], 0
    # melee by default: wind-up then swing across
    return 1.0, [(0, pose()), (.3, pose(RightArm=((0, 0, 1), -70), Spine=((0, 0, 1), -25))), (.55, pose(RightArm=((1, 0, 0), 90), Spine=((0, 0, 1), 25))), (1.0, pose())], 0


def add_stub_clips(scene, src_arm, names: list[str], fps: int):
    actions = {}
    for name in names:
        seconds, keys, hip_drop = stub_motion(name)
        action = bpy.data.actions.new(name)
        set_action(src_arm, action)
        for t, poses in keys:
            frame = round(t * fps)
            for pb in src_arm.pose.bones:
                pb.rotation_quaternion = Quaternion((1, 0, 0, 0)); pb.location = (0, 0, 0)
            for bname, (axis, deg) in poses.items():
                if bname in src_arm.pose.bones:
                    src_arm.pose.bones[bname].rotation_quaternion = Quaternion(Vector(axis), math.radians(deg))
            if hip_drop and t >= seconds * .4:
                src_arm.pose.bones['Hips'].location = (0, hip_drop * min(1, t / seconds), 0)
            for pb in src_arm.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=frame)
            src_arm.pose.bones['Hips'].keyframe_insert('location', frame=frame)
        actions[name] = action
    return actions


def angular_error_deg(a: Quaternion, b: Quaternion) -> float:
    d = a.rotation_difference(b)
    return math.degrees(abs(d.angle if d.angle <= math.pi else 2 * math.pi - d.angle))


def selftest(target_path: str, out_dir: str, fps: int):
    reset_scene(fps)
    scene = bpy.context.scene
    _, tgt = import_glb(target_path)
    src, actions = build_synthetic_source(scene, fps)
    bone_map = build_map('mixamo', [b.name for b in src.data.bones])
    assert len(bone_map) == 22, f'expected 22 mapped bones, got {len(bone_map)}'
    made = []
    for name in ('Synthetic_Wave', 'Synthetic_Crouch'):
        action, frames = retarget_clip(scene, src, actions[name], tgt, bone_map, name, fps, reference_action=actions['TPose'])
        made.append(action)
        log('selftest clip', name, 'frames', frames)
    # Check 1: at the wave's end, the target upper_arm_R world delta from its rest
    # equals the source RightArm delta from the T-pose reference (within 1°).
    set_action(src, actions['TPose']); evaluate(scene, 0)
    src_ref = pose_world(src, 'RightArm').to_quaternion()
    set_action(src, actions['Synthetic_Wave']); evaluate(scene, fps)
    src_delta = pose_world(src, 'RightArm').to_quaternion() @ src_ref.inverted()
    set_action(tgt, made[0]); evaluate(scene, fps)
    tgt_delta = pose_world(tgt, 'upper_arm_R').to_quaternion() @ world_rest(tgt, 'upper_arm_R').to_quaternion().inverted()
    err = angular_error_deg(src_delta, tgt_delta)
    log(f'selftest arm delta error {err:.3f}°')
    assert err < 1.0, f'arm retarget error {err:.2f}°'
    # Check 2: the hero's spine twist equals the source twist (20° about vertical).
    src_spine = pose_world(src, 'Spine').to_quaternion()
    set_action(src, actions['TPose']); evaluate(scene, 0)
    spine_delta = src_spine @ pose_world(src, 'Spine').to_quaternion().inverted()
    set_action(tgt, made[0]); evaluate(scene, fps)
    tgt_spine_delta = pose_world(tgt, 'spine').to_quaternion() @ world_rest(tgt, 'spine').to_quaternion().inverted()
    err2 = angular_error_deg(spine_delta, tgt_spine_delta)
    log(f'selftest spine delta error {err2:.3f}°')
    assert err2 < 1.0, f'spine retarget error {err2:.2f}°'
    # Check 3: crouch moves hips down, scaled by hip height, and never sideways.
    set_action(tgt, made[1]); evaluate(scene, fps // 2)
    hips_now = pose_world(tgt, 'hips').to_translation(); hips_rest = world_rest(tgt, 'hips').to_translation()
    drop = hips_rest.z - hips_now.z
    expected = .25 * (hips_rest.z / 1.1)
    log(f'selftest hips drop {drop:.4f} expected {expected:.4f}; lateral {abs(hips_now.x - hips_rest.x):.5f}')
    assert abs(drop - expected) < .01 and abs(hips_now.x - hips_rest.x) < 1e-4
    # Check 4: unmapped behaviour — toes untouched keep rest.
    set_action(tgt, made[0]); evaluate(scene, fps)
    toe_err = angular_error_deg(pose_world(tgt, 'toe_L').to_quaternion() @ world_rest(tgt, 'toe_L').to_quaternion().inverted(),
                                pose_world(tgt, 'foot_L').to_quaternion() @ world_rest(tgt, 'foot_L').to_quaternion().inverted())
    assert toe_err < 1e-3, f'toe should follow its parent only, got {toe_err}'
    set_action(tgt, None)
    clear_target_animation(tgt, keep=made)
    push_to_nla(tgt, made)
    out = os.path.join(out_dir, 'selftest-animations.glb')
    export_armature(tgt, out)
    # Check 5: the export round-trips with both clips and 22 joints.
    reset_scene(fps)
    _, back = import_glb(out)
    names = sorted(a.name.split('.')[0] for a in bpy.data.actions)
    log('selftest export actions', names, 'bones', len(back.data.bones))
    assert len(back.data.bones) == 22 and {'Synthetic_Wave', 'Synthetic_Crouch'} <= set(names)
    assert 'idle' not in names and 'walk' not in names, 'hero idle/walk must not leak into the library'
    # Negative control: a wrong map must NOT pass the arm check.
    reset_scene(fps); scene = bpy.context.scene
    _, tgt = import_glb(target_path); src, actions = build_synthetic_source(scene, fps)
    bad = dict(bone_map); bad['upper_arm_R'], bad['upper_arm_L'] = bad['upper_arm_L'], bad['upper_arm_R']
    action, _ = retarget_clip(scene, src, actions['Synthetic_Wave'], tgt, bad, 'Bad', fps, reference_action=actions['TPose'])
    set_action(tgt, action); evaluate(scene, fps)
    bad_delta = pose_world(tgt, 'upper_arm_R').to_quaternion() @ world_rest(tgt, 'upper_arm_R').to_quaternion().inverted()
    bad_err = angular_error_deg(src_delta, bad_delta)
    log(f'selftest negative control (swapped arms) error {bad_err:.1f}° (must be large)')
    assert bad_err > 30
    log('SELFTEST PASSED', out, sha256(out)[:16], os.path.getsize(out), 'bytes')
    return out


def main(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--target', required=True, help='hero GLB whose armature is the canonical rig')
    p.add_argument('--source', action='append', default=[], help='library GLB/FBX (repeatable; pairs with --map/--clips/--reference-clip/--rename in order)')
    p.add_argument('--map', action='append', default=[], choices=['auto', 'mixamo', 'rigify'], help='bone-map strategy per source')
    p.add_argument('--clips', action='append', default=[], help='comma list of source clip names per source (default: all)')
    p.add_argument('--reference-clip', action='append', default=[], help='name of a T-pose clip in that source, or "-" for armature rest')
    p.add_argument('--rename', action='append', default=[], help='comma list old=new clip renames per source')
    p.add_argument('--interim', default='', help='comma list of OUTPUT clip names whose source motion is a stand-in from a real pack (e.g. a sword swing standing in for a bow release); recorded in the receipt')
    p.add_argument('--out', default='public/assets/animations/hero-animations.glb')
    p.add_argument('--receipt', default=None)
    p.add_argument('--fps', type=int, default=30)
    p.add_argument('--no-vertical', action='store_true', help='drop hips vertical motion too')
    p.add_argument('--selftest', action='store_true')
    p.add_argument('--stub', default=None, help='comma list of clip names to synthesize as PLACEHOLDER motion (no kit needed); the receipt marks them')
    args = p.parse_args(argv)

    if args.selftest:
        selftest(args.target, os.path.dirname(os.path.abspath(args.out)) or '.', args.fps)
        return

    reset_scene(args.fps)
    scene = bpy.context.scene
    _, tgt = import_glb(args.target)
    clear_target_animation(tgt)
    made = []
    receipt = {'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'target': os.path.basename(args.target),
               'fps': args.fps, 'method': 'world-rotation delta vs T-pose reference; hips vertical only', 'placeholder': False, 'clips': []}
    if args.stub:
        names = [n for n in args.stub.split(',') if n]
        src, base = build_synthetic_source(scene, args.fps)
        stubs = add_stub_clips(scene, src, names, args.fps)
        bone_map = build_map('mixamo', [b.name for b in src.data.bones])
        for name in names:
            action, frames = retarget_clip(scene, src, stubs[name], tgt, bone_map, name, args.fps, reference_action=base['TPose'])
            made.append(action)
            receipt['clips'].append({'name': name, 'source': 'PLACEHOLDER (synthetic, scripts/animation/retarget.py --stub)', 'sourceClip': name,
                                     'frames': frames, 'seconds': round((frames - 1) / args.fps, 4), 'mappedBones': 22, 'unmappedCanonical': [], 'reference': 'TPose'})
            log(f'  stub {name}: {frames} frames')
        receipt['placeholder'] = True
        for o in list(bpy.data.objects):
            if o is not tgt and o.type != 'MESH':
                bpy.data.objects.remove(o, do_unlink=True)
    for i, source in enumerate(args.source):
        kind = args.map[i] if i < len(args.map) else 'auto'
        wanted = [c for c in (args.clips[i] if i < len(args.clips) else '').split(',') if c]
        ref_name = args.reference_clip[i] if i < len(args.reference_clip) else '-'
        renames = dict(pair.split('=', 1) for pair in (args.rename[i] if i < len(args.rename) else '').split(',') if '=' in pair)
        before_actions = set(bpy.data.actions)
        added_objects, src = import_glb(source) if source.lower().endswith(('.glb', '.gltf')) else (None, None)
        if src is None:
            bpy.ops.import_scene.fbx(filepath=source)
            src = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o is not tgt][-1]
        src_actions = {a.name: a for a in bpy.data.actions if a not in before_actions}
        source_sha = sha256(source)
        bone_map = build_map(kind, [b.name for b in src.data.bones])
        missing = [c for c in CANONICAL if c not in bone_map]
        log(f'{os.path.basename(source)}: {len(src_actions)} clips, {len(bone_map)}/22 bones mapped; unmapped canonical: {missing}')
        log('  map:', bone_map)
        reference = src_actions.get(ref_name) if ref_name != '-' else None
        if ref_name != '-' and reference is None:
            raise SystemExit(f'reference clip {ref_name!r} not found in {source}; clips: {sorted(src_actions)}')
        targets = wanted or sorted(src_actions)
        for name in targets:
            if name not in src_actions:
                raise SystemExit(f'clip {name!r} not in {source}; available: {sorted(src_actions)}')
            out_name = renames.get(name, name)
            action, frames = retarget_clip(scene, src, src_actions[name], tgt, bone_map, out_name, args.fps,
                                           reference_action=reference, keep_vertical=not args.no_vertical)
            made.append(action)
            receipt['clips'].append({'name': out_name, 'source': os.path.basename(source), 'sourceSha256': source_sha, 'sourceClip': name,
                                     'frames': frames, 'seconds': round((frames - 1) / args.fps, 4),
                                     'mappedBones': len(bone_map), 'unmappedCanonical': missing, 'reference': ref_name})
            log(f'  {name} -> {out_name}: {frames} frames')
        # drop the source so its bones cannot collide with the next one
        for o in list(bpy.data.objects):
            if o is not tgt and o.type != 'MESH':
                bpy.data.objects.remove(o, do_unlink=True)
    push_to_nla(tgt, made)
    export_armature(tgt, args.out)
    interim = [n for n in args.interim.split(',') if n]
    for entry in receipt['clips']:
        entry['interim'] = entry['name'] in interim
    receipt['interim'] = interim
    receipt['file'] = os.path.basename(args.out); receipt['bytes'] = os.path.getsize(args.out); receipt['sha256'] = sha256(args.out)
    receipt_path = args.receipt or os.path.splitext(args.out)[0] + '.json'
    with open(receipt_path, 'w') as f:
        json.dump(receipt, f, indent=2)
    log('wrote', args.out, receipt['bytes'], 'bytes', receipt['sha256'][:16], 'receipt', receipt_path)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    main(argv)
