import React, { version } from 'react';

import { NodeModel } from '@patternfly/react-topology';
import { node } from 'prop-types';
import { style } from 'typestyle';

import { PFBadges, PFBadgeType } from '../../../components/Pf/PfBadges';
import { cluster, namespace } from '../../../components/VirtualList/Renderers';
import {
  BoxByType,
  CLUSTER_DEFAULT,
  GraphType,
  NodeType,
  UNKNOWN,
} from '../../../types/Graph';
import { GraphPFSettings } from '../types/GraphPFSettings';
import { NodeData } from '../types/NodeData';
import { NodeMap } from '../types/NodeMap';

export const setNodeLabel = (
  node: NodeModel,
  nodeMap: NodeMap,
  settings: GraphPFSettings,
): void => {
  const data = node.data as NodeData;
  const app = data.app || '';
  const nodeType = data.nodeType;
  const service = data.service || '';
  const version = data.version || '';
  const workload = data.workload || '';
  const isBox = data.isBox;
  const isBoxed = data.parent;
  let box1Type, box2Type: string | undefined;
  if (isBoxed) {
    let box1, box2: NodeModel | undefined;
    box1 = nodeMap.get(data.parent!);
    const box1Data = box1?.data as NodeData;
    box1Type = box1Data.isBox;
    box2 = box1Data.parent ? nodeMap.get(box1Data.parent!) : undefined;
    box2Type = box2 ? (box2.data as NodeData).isBox : undefined;
  }
  const isAppBoxed = box1Type === BoxByType.APP;
  // Badges portion of label...

  // PFT provides the ability to add a single Icon (badge) on the label. Given that we can't
  // duplicate what we do with Cytoscape, which is to add multiple badges on the label,
  // we'll reserve the single icon to be used only to identify traffic sources (i.e. roots).
  // Note that a gateway is a special traffic source.
  // Other badges will be added as attachments (decorators) on the node, but that requires
  // the Node, not the NodeModel, and it;s no longer part of the label, so it's not done here.

  // Content portion of label (i.e. the text)...
  const content: string[] = [];

  switch (nodeType) {
    case NodeType.AGGREGATE:
      content.unshift(data.aggregateValue!);
      break;
    case NodeType.APP:
      if (isAppBoxed) {
        if (settings.graphType === GraphType.APP) {
          content.unshift(app);
        } else if (version && version !== UNKNOWN) {
          content.unshift(version);
        } else {
          content.unshift(workload ? workload : app);
        }
      } else {
        if (settings.graphType === GraphType.APP || version === UNKNOWN) {
          content.unshift(app);
        } else {
          content.unshift(version);
          content.unshift(app);
        }
      }
      break;
    case NodeType.BOX:
      switch (isBox) {
        case BoxByType.APP:
          content.unshift(app);
          break;
        case BoxByType.CLUSTER:
          content.unshift(data.cluster);
          break;
        case BoxByType.NAMESPACE:
          content.unshift(data.namespace);
          break;
      }
      break;
    case NodeType.SERVICE:
      content.unshift(service);
      break;
    case NodeType.UNKNOWN:
      content.unshift(UNKNOWN);
      break;
    case NodeType.WORKLOAD:
      content.unshift(workload);
      break;
    default:
      content.unshift('error');
  }

  // The final label...

  if (isBox) {
    let pfBadge: PFBadgeType | undefined;
    switch (isBox) {
      case BoxByType.APP:
        pfBadge = PFBadges.App;
        break;
      case BoxByType.CLUSTER:
        pfBadge = PFBadges.Cluster;
        break;
      case BoxByType.NAMESPACE:
        pfBadge = PFBadges.Namespace;
        break;
      default:
        console.warn(`GraphSyles: Unexpected box [${isBox}] `);
    }

    if (pfBadge) {
      data.badge = pfBadge.badge;
    }
    node.label = content.shift();
    if (content.length > 0) {
      data.secondaryLabel = content.join(':');
    }
    return;
  }

  node.label = content.shift();

  return;
};
