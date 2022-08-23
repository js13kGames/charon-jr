import { Camera } from '@/engine/renderer/camera';
import { EnhancedDOMPoint } from '@/engine/enhanced-dom-point';
import { Face } from '@/engine/physics/face';
import { controls } from '@/core/controls';
import { Mesh } from '@/engine/renderer/mesh';
import { textureLoader } from '@/engine/renderer/texture-loader';
import { drawVolcanicRock } from '@/texture-maker';
import { MoldableCubeGeometry } from '@/engine/moldable-cube-geometry';
import { Material } from '@/engine/renderer/material';
import {
  findFloorHeightAtPosition,
  findWallCollisionsFromList,
  getGridPosition, halfLevelSize, maxHalfLevelValue,
} from '@/engine/physics/surface-collision';
import { audioCtx } from '@/engine/audio/audio-player';
import { Object3d } from '@/engine/renderer/object-3d';
import { truck, TruckObject3d } from '@/modeling/truck.modeling';
import { clamp, moveValueTowardsTarget } from '@/engine/helpers';
import {calculateFaceNormal, radsToDegrees} from '@/engine/math-helpers';

const debugElement = document.querySelector('#debug')!;

type GroupedFaces = {floorFaces: Face[], wallFaces: Face[]};

export class ThirdPersonPlayer {
  isJumping = false;
  chassisCenter = new EnhancedDOMPoint(0, 0, 0);
  readonly origin = new EnhancedDOMPoint(0, 0, 0);
  wheels = {
    frontLeftWheel: new EnhancedDOMPoint(),
    frontRightWheel: new EnhancedDOMPoint(),
    rearLeftWheel: new EnhancedDOMPoint(),
    rearRightWheel: new EnhancedDOMPoint(),
  };

  speed = 0;
  componentVelocity = new EnhancedDOMPoint(0, 0, 0);
  angle = 0;
  slipAngle = 0;
  steeringAngle = 0;

  mesh: TruckObject3d;
  camera: Camera;
  idealPosition = new EnhancedDOMPoint(0, 6, -17);
  idealLookAt = new EnhancedDOMPoint(0, 2, 0);

  listener: AudioListener;

  constructor(camera: Camera) {
    textureLoader.load(drawVolcanicRock());
    this.mesh = truck;
    this.chassisCenter.y = 10;
    this.camera = camera;
    this.listener = audioCtx.listener;
  }

  private transformIdeal(ideal: EnhancedDOMPoint): EnhancedDOMPoint {
    return new EnhancedDOMPoint()
      .set(this.mesh.wrapper.rotationMatrix.transformPoint(ideal))
      .add(this.mesh.position);
  }

  private lastPosition = new EnhancedDOMPoint();
  update(gridFaces: Face[][]) {
    this.lastPosition.set(this.chassisCenter);

    this.setSteeringAngle(); // calculate wheel angle and update mesh
    this.updateVelocity();  // set x / z velocity based on input


    this.componentVelocity.y -= 0.005; // gravity
    this.chassisCenter.add(this.componentVelocity);  // move the player position by the velocity

    // don't let the player leave the level
    this.chassisCenter.x = clamp(this.chassisCenter.x, -maxHalfLevelValue, maxHalfLevelValue);
    this.chassisCenter.z = clamp(this.chassisCenter.z, -maxHalfLevelValue, maxHalfLevelValue);

    // if the player falls through the floor, reset them
    if (this.chassisCenter.y < -100) {
      this.chassisCenter.y = 50;
      this.componentVelocity.y = 0;
    }

    const playerGridPosition = getGridPosition(this.chassisCenter);
    this.componentVelocity.y = clamp(this.componentVelocity.y, -1, 1);
    const groupedFaces = { floorFaces: gridFaces[playerGridPosition], wallFaces: [] };

    // 4 wheels in the right place
    this.wheels.frontLeftWheel.set(this.mesh.frontLeftWheel.worldMatrix.transformPoint(this.origin));
    this.wheels.frontRightWheel.set(this.mesh.frontRightWheel.worldMatrix.transformPoint(this.origin));
    this.wheels.rearLeftWheel.set(this.mesh.rearLeftWheel.worldMatrix.transformPoint(this.origin));
    this.wheels.rearRightWheel.set(this.mesh.rearRightWheel.worldMatrix.transformPoint(this.origin));
    const collisionDepths = Object.values(this.wheels).map((wheel) => this.collidePoint(wheel, groupedFaces));
    const wheelsOnGroundPoints = Object.values(this.wheels).map((wheel, index) => {
      return new EnhancedDOMPoint(wheel.x, wheel.y + collisionDepths[index], wheel.z, wheel.w);
    });

    const firstNormal = calculateFaceNormal([wheelsOnGroundPoints[0], wheelsOnGroundPoints[1], wheelsOnGroundPoints[2]]);
    const secondNormal = calculateFaceNormal([wheelsOnGroundPoints[3], wheelsOnGroundPoints[2], wheelsOnGroundPoints[1]]);


    const averageNormal = firstNormal.average(secondNormal);

    const averageCollisionDepth = collisionDepths.reduce((prev, current) => prev += current) / 4;

    const collisionDepth = this.collidePoint(this.chassisCenter, groupedFaces); // do collision detection, if collision is found, feetCenter gets pushed out of the collision

    this.updatePlayerPosition(collisionDepth, firstNormal);
    // if chassis center value is higher, leave alone. if lower, change angle and reposition


    // this.collideWithLevel(this.frontLeftWheel, groupedFaces);
    // this.collideWithLevel(this.frontRightWheel, groupedFaces);

    this.mesh.position.set(this.chassisCenter); // at this point, feetCenter is in the correct spot, so draw the mesh there
    this.mesh.position.y += 0.5; // move up by half height so mesh ends at feet position

    this.camera.position.lerp(this.transformIdeal(this.idealPosition), 0.1);

    // Keep camera away regardless of lerp
    const distanceToKeep = 17;
    const {x, z} = this.camera.position.clone()
      .subtract(this.mesh.position) // distance from camera to player
      .normalize() // direction of camera to player
      .scale(distanceToKeep) // scale direction out by distance, giving us a lerp direction but constant distance
      .add(this.mesh.position); // move back relative to player

    this.camera.position.x = x;
    this.camera.position.z = z;

    this.camera.lookAt(this.transformIdeal(this.idealLookAt));
    this.camera.updateWorldMatrix();

    this.updateAudio();
  }

  private axis = new EnhancedDOMPoint();
  private previousFloorHeight = 0;
  collidePoint(pointToCollide: EnhancedDOMPoint, groupedFaces: GroupedFaces): number {
    const wallCollisions = findWallCollisionsFromList(groupedFaces.wallFaces, pointToCollide, 0.4, 0.1);
    pointToCollide.x += wallCollisions.xPush;
    pointToCollide.z += wallCollisions.zPush;

    const floorData = findFloorHeightAtPosition(groupedFaces!.floorFaces, pointToCollide);

    return floorData ? floorData.height - pointToCollide.y : 0;
  }

  private updatePlayerPosition(floorCollisionDepth: number, normal: EnhancedDOMPoint) {
    if (floorCollisionDepth > -.2) {
      // const verticalDistanceTraveled = floorData.height - this.previousFloorHeight;
      // debugElement.textContent = `${verticalDistanceTraveled}`;
      // if (floorData.height)

      this.lastPosition.set(this.chassisCenter);
      this.chassisCenter.y += floorCollisionDepth;
      this.componentVelocity.y = 0;
      this.isJumping = false;
      this.axis = this.axis.crossVectors(this.mesh.up, normal);
      const radians = Math.acos(normal.dot(this.mesh.up));
      this.mesh.rotationMatrix = new DOMMatrix();
      this.mesh.rotationMatrix.rotateAxisAngleSelf(this.axis.x, this.axis.y, this.axis.z, radsToDegrees(radians));
      // this.previousFloorHeight = floorData.height;
    } else {
      this.isJumping = true;
    }

    const heightTraveled = this.chassisCenter.y - this.lastPosition.y;

    if (heightTraveled > 0.1 && !this.isJumping) {
      this.componentVelocity.y += heightTraveled;
    }
  }

  protected setSteeringAngle() {
    this.steeringAngle = moveValueTowardsTarget(this.steeringAngle, controls.direction * -0.7, 0.05);
    this.mesh.setSteeringAngle(this.steeringAngle);

  }

  protected updateVelocity() {
    // wind resistance
    this.speed = moveValueTowardsTarget(this.speed, 0, .005);

    if (!this.isJumping) {
      enum ControlState {
        Accelerating,
        Braking,
        Coasting,
      }
      let controlState = ControlState.Coasting;

      if (controls.rightTrigger && this.speed >= 0 || controls.leftTrigger && this.speed <= 0) {
        // accelerating
        controlState = ControlState.Accelerating;
      }

      if (controls.leftTrigger && this.speed > 0 || controls.rightTrigger && this.speed < 0) {
        controlState = ControlState.Braking;
      }

      const inversionFactor =  controls.leftTrigger && this.speed <= 0 || this.speed < 0 ? -1 : 1;

      // rolling resistance
      this.speed = moveValueTowardsTarget(this.speed, 0, Math.abs(this.speed) * .009);


      switch (controlState) {
        case ControlState.Accelerating:
          this.speed = moveValueTowardsTarget(this.speed, 2 * inversionFactor, 0.02);
          break;
        case ControlState.Braking:
          this.speed = moveValueTowardsTarget(this.speed, 0, 0.01);
          break;
      }

      if (controls.direction) {
        this.angle += this.steeringAngle * 0.05 * inversionFactor * Math.abs(this.speed);
      }

      // drifting is initiated by a speed threshold. It also continues once started.
      const shouldBeDrifting = this.speed > .6;

      if (controlState === ControlState.Accelerating && shouldBeDrifting) {
        // accel plus neutral steering input continues the slide as-is
        // this.steeringAngle moves to and from control direction. We want player input to directly impact drifting
        // regardless of where the animated wheels are pointed
        const inputAngle = controls.direction * -0.7;
        if (inputAngle !== 0) {
          this.slipAngle = moveValueTowardsTarget(this.slipAngle, inputAngle * this.speed, .25);
          // determine if in-steer or out-steer. insteer increases angle and out-steer decreases.
          const isInsteer = Math.sign(controls.direction) === Math.sign(this.slipAngle);
          if (isInsteer) {
            // insteer increases angle
            this.slipAngle = moveValueTowardsTarget(this.slipAngle, inputAngle * this.speed, .05);
          } else {
            // countersteer decreases angle
            this.slipAngle = moveValueTowardsTarget(this.slipAngle, 0, .05);
          }
        }
      } else {
        // accel off pulls slip angle back to 0
        this.slipAngle = moveValueTowardsTarget(this.slipAngle, 0, .05);
      }


    }

    this.componentVelocity.z = Math.cos(this.angle) * this.speed;
    this.componentVelocity.x = Math.sin(this.angle) * this.speed;

    this.mesh.wrapper.setRotation(0, this.angle + this.slipAngle, 0);

    this.mesh.setDriveRotationRate(this.speed);

    if (controls.isSpace || controls.isJumpPressed) {
      if (!this.isJumping) {
        this.componentVelocity.y = 0.15;
        this.isJumping = true;
      }
    }
    debugElement.textContent = `
        Speed: ${this.speed}
        steering angle: ${this.steeringAngle}
        Slip Angle: ${this.slipAngle}
        Angle: ${this.angle};
        controls: ${controls.direction * -0.7}
      `;
  }

  private updateAudio() {
    this.listener.positionX.value = this.mesh.position.x;
    this.listener.positionY.value = this.mesh.position.y;
    this.listener.positionZ.value = this.mesh.position.z;

    // const cameraDireciton = new EnhancedDOMPoint();
    // cameraDireciton.setFromRotationMatrix(this.camera.rotationMatrix);

    const {x, z} = this.mesh.position.clone()
      .subtract(this.camera.position) // distance from camera to player
      .normalize(); // direction of camera to player

    this.listener.forwardX.value = x;
    // this.listener.forwardY.value = cameraDireciton.y;
    this.listener.forwardZ.value = z;
  }
}
