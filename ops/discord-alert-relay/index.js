import { cloudEvent } from '@google-cloud/functions-framework';
import { monitoringAlertToDiscord } from './handler.js';

cloudEvent('monitoringAlertToDiscord', monitoringAlertToDiscord);
