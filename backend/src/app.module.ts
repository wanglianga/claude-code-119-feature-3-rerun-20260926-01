import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Venue } from './entities/venue.entity';
import { Organizer } from './entities/organizer.entity';
import { Screening } from './entities/screening.entity';
import { Equipment } from './entities/equipment.entity';
import { EquipmentAssignment } from './entities/equipment-assignment.entity';
import { Inspection } from './entities/inspection.entity';
import { Incident, IncidentReply } from './entities/incident.entity';
import { TimelineEvent } from './entities/timeline-event.entity';
import { VolunteerCheckin } from './entities/volunteer-checkin.entity';
import { Settlement } from './entities/settlement.entity';
import { NoiseReview } from './entities/noise-review.entity';
import { AuthModule } from './modules/auth/auth.module';
import { VenuesModule } from './modules/venues/venues.module';
import { OrganizersModule } from './modules/organizers/organizers.module';
import { ScreeningsModule } from './modules/screenings/screenings.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { VolunteersModule } from './modules/volunteers/volunteers.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { NoiseReviewsModule } from './modules/noise-reviews/noise-reviews.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SeedService } from './seed/seed.service';
import { HealthController } from './health.controller';

const entities = [
  User, Venue, Organizer, Screening, Equipment, EquipmentAssignment,
  Inspection, Incident, IncidentReply, TimelineEvent, VolunteerCheckin, Settlement,
  NoiseReview,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'db',
        port: Number(process.env.DB_PORT) || 5432,
        username: process.env.DB_USER || 'cinema',
        password: process.env.DB_PASSWORD || 'cinema',
        database: process.env.DB_NAME || 'opencinema',
        entities,
        synchronize: true,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature(entities),
    AuthModule,
    VenuesModule,
    OrganizersModule,
    ScreeningsModule,
    EquipmentModule,
    InspectionsModule,
    IncidentsModule,
    VolunteersModule,
    SettlementsModule,
    NoiseReviewsModule,
    DashboardModule,
  ],
  providers: [SeedService],
  controllers: [HealthController],
})
export class AppModule {}
