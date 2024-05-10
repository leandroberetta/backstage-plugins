import {
  EdgeModel,
  EdgeTerminalType,
  NodeStatus,
} from '@patternfly/react-topology';
import _ from 'lodash';

import { PFColors } from '../../../components/Pf/PfColors';
import { icons } from '../../../config/Icons';
import {
  EdgeLabelMode,
  numLabels,
  Protocol,
  TrafficRate,
} from '../../../types/Graph';
import { DEGRADED, FAILURE } from '../../../types/Health';
import { EdgeData } from '../types/EdgeData';
import { GraphPFSettings } from '../types/GraphPFSettings';
import { NodeMap } from '../types/NodeMap';

export const trimFixed = (fixed: string): string => {
  let newFixed = fixed;
  if (!fixed.includes('.')) {
    return newFixed;
  }
  while (fixed.endsWith('0')) {
    newFixed = fixed.slice(0, -1);
  }
  return newFixed.endsWith('.') ? (newFixed = fixed.slice(0, -1)) : newFixed;
};

// This is due to us never having figured out why a tiny fraction of what-we-expect-to-be-numbers
// are in fact strings.  We don't know if our conversion in GraphData.ts has a flaw, or whether
// something else happens post-conversion.
export const safeNum = (num: any): number => {
  if (Number.isFinite(num)) {
    return num;
  }
  // this will return NaN if the string is 'NaN' or any other non-number
  return Number(num);
};

export const toFixedDuration = (num: number): string => {
  const newNum = safeNum(num);
  if (num < 1000) {
    return `${newNum.toFixed(0)}ms`;
  }
  return `${trimFixed((newNum / 1000.0).toFixed(2))}s`;
};

export const toFixedPercent = (num: number): string => {
  const newNum = safeNum(num);
  return `${trimFixed(newNum.toFixed(1))}%`;
};

export const toFixedRequestRate = (
  num: number,
  includeUnits: boolean,
  units?: string,
): string => {
  const newNum = safeNum(num);
  const rate = trimFixed(newNum.toFixed(2));
  return includeUnits ? `${rate}${units || 'rps'}` : rate;
};

export const toFixedErrRate = (num: number): string => {
  const newNum = safeNum(num);
  return `${trimFixed(newNum.toFixed(newNum < 1 ? 1 : 0))}%err`;
};

export const toFixedByteRate = (num: number, includeUnits: boolean): string => {
  const newNum = safeNum(num);
  if (newNum < 1024.0) {
    const rate =
      newNum < 1.0 ? trimFixed(newNum.toFixed(2)) : newNum.toFixed(0);
    return includeUnits ? `${rate}bps` : rate;
  }
  const rate = trimFixed((num / 1024.0).toFixed(2));
  return includeUnits ? `${rate}kps` : rate;
};

export const getEdgeLabel = (
  edge: EdgeModel,
  nodeMap: NodeMap,
  settings: GraphPFSettings,
): string => {
  const data = edge.data as EdgeData;
  const edgeLabels = settings.edgeLabels;
  const isVerbose = data.isSelected;
  const includeUnits = isVerbose || numLabels(edgeLabels) > 1;
  let labels = [] as string[];

  if (edgeLabels.includes(EdgeLabelMode.TRAFFIC_RATE)) {
    let rate = 0;
    let pErr = 0;
    if (data.http > 0) {
      rate = data.http;
      pErr = data.httpPercentErr > 0 ? data.httpPercentErr : 0;
    } else if (data.grpc > 0) {
      rate = data.grpc;
      pErr = data.grpcPercentErr > 0 ? data.grpcPercentErr : 0;
    } else if (data.tcp > 0) {
      rate = data.tcp;
    }

    if (rate > 0) {
      if (pErr > 0) {
        labels.push(
          `${toFixedRequestRate(rate, includeUnits)}\n${toFixedErrRate(pErr)}`,
        );
      } else {
        switch (data.protocol) {
          case Protocol.GRPC:
            if (settings.trafficRates.includes(TrafficRate.GRPC_REQUEST)) {
              labels.push(toFixedRequestRate(rate, includeUnits));
            } else {
              labels.push(toFixedRequestRate(rate, includeUnits, 'mps'));
            }
            break;
          case Protocol.TCP:
            labels.push(toFixedByteRate(rate, includeUnits));
            break;
          default:
            labels.push(toFixedRequestRate(rate, includeUnits));
            break;
        }
      }
    }
  }

  if (edgeLabels.includes(EdgeLabelMode.RESPONSE_TIME_GROUP)) {
    let responseTime = data.responseTime;

    if (responseTime > 0) {
      labels.push(toFixedDuration(responseTime));
    }
  }

  if (edgeLabels.includes(EdgeLabelMode.THROUGHPUT_GROUP)) {
    let rate = data.throughput;

    if (rate > 0) {
      labels.push(toFixedByteRate(rate, includeUnits));
    }
  }

  if (edgeLabels.includes(EdgeLabelMode.TRAFFIC_DISTRIBUTION)) {
    let pReq;
    if (data.httpPercentReq > 0) {
      pReq = data.httpPercentReq;
    } else if (data.grpcPercentReq > 0) {
      pReq = data.grpcPercentReq;
    }
    if (pReq && pReq > 0 && pReq < 100) {
      labels.push(toFixedPercent(pReq));
    }
  }

  let label = labels.join('\n');

  if (isVerbose) {
    const protocol = data.protocol;
    label = protocol ? `${protocol}\n${label}` : label;
  }

  const mtlsPercentage = data.isMTLS;
  let lockIcon = false;
  if (settings.showSecurity && data.hasTraffic) {
    if (mtlsPercentage && mtlsPercentage > 0) {
      lockIcon = true;
      label = `${icons.istio.mtls.ascii}\n${label}`;
    }
  }

  if (data.hasTraffic && data.responses) {
    if (nodeMap.get(edge.target!)?.data?.hasCB) {
      const responses = data.responses;
      for (let code of _.keys(responses)) {
        // TODO: Not 100% sure we want "UH" code here ("no healthy upstream hosts") but based on timing I have
        // seen this code returned and not "UO". "UO" is returned only when the circuit breaker is caught open.
        // But if open CB is responsible for removing possible destinations the "UH" code seems preferred.
        if ('UO' in responses[code] || 'UH' in responses[code]) {
          label = lockIcon
            ? `${icons.istio.circuitBreaker.className} ${label}`
            : `${icons.istio.circuitBreaker.className}\n${label}`;
          break;
        }
      }
    }

    return label;
  }
};

const EdgeColor = PFColors.Success;
const EdgeColorDead = PFColors.Black500;
const EdgeColorDegraded = PFColors.Warning;
const EdgeColorFailure = PFColors.Danger;
const EdgeColorTCPWithTraffic = PFColors.Blue600;

const getPathStyleStroke = (data: EdgeData): PFColors => {
  if (!data.hasTraffic) {
    return EdgeColorDead;
  }
  if (data.protocol === 'tcp') {
    return EdgeColorTCPWithTraffic;
  }
  switch (data.healthStatus) {
    case FAILURE.name:
      return EdgeColorFailure;
    case DEGRADED.name:
      return EdgeColorDegraded;
    default:
      return EdgeColor;
  }
};

export const getPathStyle = (data: EdgeData): React.CSSProperties => {
  return {
    stroke: getPathStyleStroke(data),
    strokeWidth: 3,
  } as React.CSSProperties;
};

export const getEdgeStatus = (data: EdgeData): NodeStatus => {
  if (!data.hasTraffic) {
    return NodeStatus.default;
  }
  if (data.protocol === 'tcp') {
    return NodeStatus.info;
  }

  switch (data.healthStatus) {
    case FAILURE.name:
      return NodeStatus.danger;
    case DEGRADED.name:
      return NodeStatus.warning;
    default:
      return NodeStatus.success;
  }
};

export const setEdgeOptions = (
  edge: EdgeModel,
  nodeMap: NodeMap,
  settings: GraphPFSettings,
): void => {
  const data = edge.data as EdgeData;

  data.endTerminalType =
    data.protocol === Protocol.TCP
      ? EdgeTerminalType.square
      : EdgeTerminalType.directional;
  data.pathStyle = getPathStyle(data);
  data.tag = getEdgeLabel(edge, nodeMap, settings);
  data.tagStatus = getEdgeStatus(data);
};
