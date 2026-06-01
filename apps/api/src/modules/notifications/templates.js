'use strict';

const TEMPLATE_BY_EVENT = {
  'slot_offer.sent': {
    title: 'Slot offer ready',
    subject: 'New appointment slot offer',
    message: 'A clinic appointment slot offer is ready for review.'
  },
  'slot_offer.accepted': {
    title: 'Slot offer accepted',
    subject: 'Customer accepted a slot offer',
    message: 'A customer accepted the proposed appointment slot.'
  },
  'slot_offer.declined': {
    title: 'Slot offer declined',
    subject: 'Customer declined a slot offer',
    message: 'A customer declined the proposed appointment slot.'
  },
  'booking_request.status_changed': {
    title: 'Booking request updated',
    subject: 'Booking request status changed',
    message: 'A booking request status was updated by the clinic.'
  }
};

function renderNotificationTemplate(eventType) {
  const template = TEMPLATE_BY_EVENT[eventType];
  if (!template) {
    return null;
  }

  return { ...template };
}

module.exports = {
  renderNotificationTemplate
};
