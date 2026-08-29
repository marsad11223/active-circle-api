import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { RecurringActivitySpawnService } from 'src/activity/recurring-activity-spawn.service';
import { Activity, ActivityStatus, RecurringType } from 'src/schemas/activity.schema';
import { RecurringSeries } from 'src/schemas/recurring-series.schema';

describe('RecurringActivitySpawnService', () => {
  let service: RecurringActivitySpawnService;

  const seriesId = new Types.ObjectId();
  const hostId = new Types.ObjectId();

  const activeSeries = {
    _id: seriesId,
    hostId,
    recurring: RecurringType.WEEKLY,
    scheduleRule: {
      dayOfWeek: 2,
      startTime: '10:00',
      durationMinutes: 60,
      timezone: 'Europe/London',
    },
    active: true,
    lastOccurrenceStartDateTime: new Date('2026-01-06T10:00:00.000Z'),
    title: 'Yoga',
    description: 'Weekly yoga',
    category: ['fitness'],
    location: 'Park',
    maxParticipants: 10,
    price: 0,
    picture: 'pic.jpg',
    pictures: ['pic.jpg'],
  };

  const recurringSeriesModel = {
    findById: jest.fn(),
    updateOne: jest.fn(),
  };

  const activityModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  function mockNoFutureActive(): void {
    activityModel.findOne.mockImplementation((query: Record<string, unknown>) => {
      const startDateTime = query.startDateTime as { $gt?: Date } | undefined;
      if (startDateTime?.$gt) {
        return {
          sort: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      };
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockNoFutureActive();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringActivitySpawnService,
        { provide: getModelToken(Activity.name), useValue: activityModel },
        {
          provide: getModelToken(RecurringSeries.name),
          useValue: recurringSeriesModel,
        },
      ],
    }).compile();

    service = module.get(RecurringActivitySpawnService);
  });

  it('returns not_applicable when series is stopped', async () => {
    recurringSeriesModel.findById.mockResolvedValue({
      ...activeSeries,
      active: false,
    });

    const result = await service.ensureNextOccurrenceForSeries(seriesId);

    expect(result.status).toBe('not_applicable');
    expect(activityModel.create).not.toHaveBeenCalled();
  });

  it('does not spawn for one-time activities on completion trigger', async () => {
    await service.triggerSpawnAfterCompletion({
      recurring: RecurringType.ONE_TIME,
    } as Activity);

    expect(recurringSeriesModel.findById).not.toHaveBeenCalled();
  });

  it('creates next occurrence keyed by seriesId and startDateTime', async () => {
    recurringSeriesModel.findById.mockResolvedValue(activeSeries);
    activityModel.create.mockResolvedValue({
      _id: new Types.ObjectId(),
      seriesId,
      status: ActivityStatus.ACTIVE,
    });
    recurringSeriesModel.updateOne.mockResolvedValue({ acknowledged: true });

    const result = await service.ensureNextOccurrenceForSeries(seriesId);

    expect(result.status).toBe('created');
    expect(activityModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesId,
        title: activeSeries.title,
      }),
    );
    expect(recurringSeriesModel.updateOne).toHaveBeenCalled();
  });

  it('returns already_exists when occurrence slot is present (idempotent)', async () => {
    recurringSeriesModel.findById.mockResolvedValue(activeSeries);
    const existingId = new Types.ObjectId();

    activityModel.findOne.mockImplementation((query: Record<string, unknown>) => {
      const startDateTime = query.startDateTime as { $gt?: Date } | undefined;
      if (startDateTime?.$gt) {
        return {
          sort: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(null),
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: existingId }),
        }),
      };
    });

    const result = await service.ensureNextOccurrenceForSeries(seriesId);

    expect(result.status).toBe('already_exists');
    expect(result.activityId).toBe(existingId.toString());
    expect(activityModel.create).not.toHaveBeenCalled();
  });

  it('skips spawn when a future active occurrence already exists', async () => {
    recurringSeriesModel.findById.mockResolvedValue(activeSeries);
    const futureId = new Types.ObjectId();
    const futureStart = new Date('2026-09-07T10:00:00.000Z');

    activityModel.findOne.mockImplementation((query: Record<string, unknown>) => {
      const startDateTime = query.startDateTime as { $gt?: Date } | undefined;
      if (startDateTime?.$gt) {
        return {
          sort: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue({
                _id: futureId,
                startDateTime: futureStart,
              }),
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      };
    });

    const result = await service.ensureNextOccurrenceForSeries(seriesId);

    expect(result.status).toBe('future_already_scheduled');
    expect(result.activityId).toBe(futureId.toString());
    expect(activityModel.create).not.toHaveBeenCalled();
  });
});
