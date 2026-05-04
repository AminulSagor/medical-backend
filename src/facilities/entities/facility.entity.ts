import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('facilities')
export class Facility {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  roomNumber: string | null;

  @Column({ type: 'varchar', length: 400 })
  physicalAddress: string;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
