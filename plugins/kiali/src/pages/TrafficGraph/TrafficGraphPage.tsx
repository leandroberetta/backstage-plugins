import React, { useEffect } from 'react';

import { useApi } from '@backstage/core-plugin-api';

import { CircularProgress } from '@material-ui/core';
import {
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
} from '@patternfly/react-topology';

import { HistoryManager } from '../../app/History';
import { DefaultSecondaryMasthead } from '../../components/DefaultSecondaryMasthead/DefaultSecondaryMasthead';
import * as FilterHelper from '../../components/FilterList/FilterHelper';
import { TimeDurationComponent } from '../../components/Time/TimeDurationComponent';
import { kialiApiRef } from '../../services/Api';
import { KialiAppState, KialiContext } from '../../store';
import { EdgeLabelMode, GraphType, TrafficRate } from '../../types/Graph';
import { ENTITY } from '../../types/types';
import { KialiComponentFactory } from './factories/KialiComponentFactory';
import { KialiLayoutFactory } from './factories/KialiLayoutFactory';
import { decorateGraphData } from './util/GraphDecorator';
import { generateDataModel } from './util/GraphGenerator';

function TrafficGraphPage(props: { view?: string }) {
  const kialiClient = useApi(kialiApiRef);
  const kialiState = React.useContext(KialiContext) as KialiAppState;
  const [duration, setDuration] = React.useState<number>(
    FilterHelper.currentDuration(),
  );
  const [loadingData, setLoadingData] = React.useState<boolean>(false);

  const visualizationRef = React.useRef<Visualization>();

  if (!visualizationRef.current) {
    visualizationRef.current = new Visualization();
    visualizationRef.current.registerLayoutFactory(KialiLayoutFactory);
    visualizationRef.current.registerComponentFactory(KialiComponentFactory);
    visualizationRef.current.setFitToScreenOnLayout(true);
  }

  const controller = visualizationRef.current;

  const graphConfig = {
    id: 'g1',
    type: 'graph',
    layout: 'Dagre',
  };

  const graphQueryElements = {
    activeNamespaces: kialiState.namespaces.activeNamespaces
      .map(ns => ns.name)
      .join(','),
    namespaces: kialiState.namespaces.activeNamespaces
      .map(ns => ns.name)
      .join(','),
    graphType: GraphType.VERSIONED_APP,
    injectServiceNodes: true,
    boxByNamespace: true,
    boxByCluster: true,
    showOutOfMesh: false,
    showSecurity: false,
    showVirtualServices: false,
    edgeLabels: [
      EdgeLabelMode.TRAFFIC_RATE,
      EdgeLabelMode.TRAFFIC_DISTRIBUTION,
    ],
    trafficRates: [
      TrafficRate.HTTP_REQUEST,
      TrafficRate.GRPC_TOTAL,
      TrafficRate.TCP_TOTAL,
    ],
  };

  useEffect(() => {
    const d = HistoryManager.getDuration();
    if (d !== undefined) {
      setDuration(d);
    } else {
      setDuration(FilterHelper.currentDuration());
    }
  }, [HistoryManager.getDuration()]);

  const timeDuration = (
    <TimeDurationComponent
      key="DurationDropdown"
      id="graph-duration-dropdown"
      disabled={false}
      duration={duration.toString()}
      setDuration={setDuration}
      label="From:"
    />
  );

  const elements = [timeDuration];

  const fetchGraph = async () => {
    setLoadingData(true);
    if (kialiState.namespaces.activeNamespaces.length === 0) {
      controller.fromModel(
        {
          nodes: [],
          edges: [],
          graph: graphConfig,
        },
        false,
      );
      setLoadingData(false);
      return;
    }

    const data = await kialiClient.getGraphElements(graphQueryElements);
    const graphData = decorateGraphData(data.elements, data.duration);
    const g = generateDataModel(graphData, graphQueryElements);

    controller.fromModel(
      {
        nodes: g.nodes,
        edges: g.edges,
        graph: graphConfig,
      },
      false,
    );
    setLoadingData(false);
  };

  useEffect(() => {
    fetchGraph();
  }, [duration, kialiState.namespaces.activeNamespaces]);

  if (loadingData) {
    return <CircularProgress />;
  }

  return (
    <>
      {props.view !== ENTITY && (
        <DefaultSecondaryMasthead
          elements={elements}
          onRefresh={() => {
            fetchGraph();
          }}
        />
      )}

      <VisualizationProvider controller={controller}>
        <VisualizationSurface state={{ duration }} />
      </VisualizationProvider>
    </>
  );
}

export default TrafficGraphPage;
