import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type AuthProvider = 'local' | 'google' | 'facebook';

@Entity('user_auth_identities')
export class UserAuthIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.authIdentity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'local' })
  authProvider: AuthProvider;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  googleId?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  facebookId?: string | null;
}
