// import {
//     Entity,
//     PrimaryGeneratedColumn,
//     Column,
//     CreateDateColumn,
//     UpdateDateColumn,
//     ManyToOne,
//     OneToMany,
//     JoinColumn,
//     Index,
// } from "typeorm";
// import { Workshop } from "./workshop.entity";
// import { User } from "../../users/entities/user.entity";
// import { WorkshopAttendee } from "./workshop-attendee.entity";

// export enum ReservationStatus {
//     PENDING = "pending",
//     CONFIRMED = "confirmed",
//     CANCELLED = "cancelled",
// }

// @Entity("workshop_reservations")
// export class WorkshopReservation {
//     @PrimaryGeneratedColumn("uuid")
//     id: string;

//     @Index()
//     @Column({ type: "uuid" })
//     workshopId: string;

//     @Index()
//     @Column({ type: "uuid" })
//     userId: string;

//     @Column({ type: "int" })
//     numberOfSeats: number;

//     @Column({ type: "numeric", precision: 12, scale: 2 })
//     pricePerSeat: string;

//     @Column({ type: "numeric", precision: 12, scale: 2 })
//     totalPrice: string;

//     @Column({ type: "enum", enum: ReservationStatus, default: ReservationStatus.PENDING })
//     status: ReservationStatus;

//     @Column({ type: "text", nullable: true })
//     notes?: string;

//     @ManyToOne(() => Workshop, { eager: false })
//     @JoinColumn({ name: "workshopId" })
//     workshop: Workshop;

//     @ManyToOne(() => User, { eager: false })
//     @JoinColumn({ name: "userId" })
//     user: User;

//     @OneToMany(() => WorkshopAttendee, attendee => attendee.reservation, { cascade: true, eager: true })
//     attendees: WorkshopAttendee[];

//     @CreateDateColumn()
//     createdAt: Date;

//     @UpdateDateColumn()
//     updatedAt: Date;
// }

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workshop } from './workshop.entity';
import { User } from './../../users/entities/user.entity';
import { WorkshopAttendee } from './workshop-attendee.entity';
import { CourseProgressStatus } from './course-progress-status.enum';

export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

@Entity('workshop_reservations')
export class WorkshopReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  workshopId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  numberOfSeats: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  pricePerSeat: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalPrice: string;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({
    type: 'enum',
    enum: CourseProgressStatus,
    default: CourseProgressStatus.NOT_STARTED,
  })
  courseProgressStatus: CourseProgressStatus;

  @Column({ type: 'timestamptz', nullable: true })
  courseStartedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  courseCompletedAt?: Date;

  @Column({ type: 'boolean', default: false })
  cmeCreditsAwarded: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  cmeCreditsAwardedAt?: Date;

  @Column({ type: 'varchar', length: 20, default: 'single' })
  bookingType: 'single' | 'group';

  @Column({ type: 'varchar', length: 200, nullable: true })
  bookerFullName?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  bookerEmail?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bookerPhoneNumber?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  institutionOrHospital?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentGateway?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentTransactionId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  paymentCompletedAt?: Date;

  @ManyToOne(() => Workshop, { eager: false })
  @JoinColumn({ name: 'workshopId' })
  workshop: Workshop;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => WorkshopAttendee, (attendee) => attendee.reservation, {
    cascade: true,
    eager: true,
  })
  attendees: WorkshopAttendee[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
