import { REALTIME_EVENTS } from '@dctl/shared';
import { type RealtimeService } from '../../../infrastructure/realtime/realtime.service';
import {
  FamilyCreatedEvent,
  FamilyDissolvedEvent,
  FamilyMemberJoinedEvent,
  FamilyMemberRemovedEvent,
} from '../events';
import { FamilyRealtimeListener } from './family-realtime.listener';

function setup() {
  const realtime = {
    joinFamilyRoom: jest.fn(),
    leaveFamilyRoom: jest.fn(),
    emitToUser: jest.fn(),
    emitToFamily: jest.fn(),
  };
  return { realtime, listener: new FamilyRealtimeListener(realtime as unknown as RealtimeService) };
}

describe('FamilyRealtimeListener — keeps Socket.IO rooms in sync (BR-06)', () => {
  it('creator joins the new family room', () => {
    const { realtime, listener } = setup();

    listener.onCreated(new FamilyCreatedEvent('fam-a', 'owner'));

    expect(realtime.joinFamilyRoom).toHaveBeenCalledWith('owner', 'fam-a');
    expect(realtime.emitToUser).toHaveBeenCalledWith('owner', REALTIME_EVENTS.USER_FAMILY_CHANGED, {
      familyId: 'fam-a',
      reason: 'created',
    });
  });

  it('a joining member enters the room and the family is told', () => {
    const { realtime, listener } = setup();

    listener.onJoined(new FamilyMemberJoinedEvent('fam-a', 'u2'));

    expect(realtime.joinFamilyRoom).toHaveBeenCalledWith('u2', 'fam-a');
    expect(realtime.emitToFamily).toHaveBeenCalledWith(
      'fam-a',
      REALTIME_EVENTS.FAMILY_MEMBERS_CHANGED,
      { familyId: 'fam-a', change: 'joined', userId: 'u2' },
    );
  });

  it('a removed member leaves the room BEFORE the family is notified', () => {
    const { realtime, listener } = setup();
    const order: string[] = [];
    realtime.leaveFamilyRoom.mockImplementation(() => {
      order.push('leave');
    });
    realtime.emitToFamily.mockImplementation(() => order.push('emitToFamily'));

    listener.onRemoved(new FamilyMemberRemovedEvent('fam-a', 'u2', 'owner'));

    expect(order).toEqual(['leave', 'emitToFamily']);
    expect(realtime.emitToUser).toHaveBeenCalledWith('u2', REALTIME_EVENTS.USER_FAMILY_CHANGED, {
      familyId: null,
      reason: 'removed',
    });
  });

  it('dissolving a family removes the last owner from the room', () => {
    const { realtime, listener } = setup();

    listener.onDissolved(new FamilyDissolvedEvent('fam-a', 'owner'));

    expect(realtime.leaveFamilyRoom).toHaveBeenCalledWith('owner', 'fam-a');
  });

  it('never throws (a realtime failure must not break the REST call)', () => {
    const { realtime, listener } = setup();
    realtime.joinFamilyRoom.mockImplementation(() => {
      throw new Error('redis down');
    });

    expect(() => listener.onJoined(new FamilyMemberJoinedEvent('fam-a', 'u2'))).not.toThrow();
  });
});
