import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
import { getErrorString, kialiApiRef } from '../../services/Api';
import { KialiAppState, KialiContext } from '../../store';
import { EdgeLabelMode, GraphType, TrafficRate } from '../../types/Graph';
import { ENTITY } from '../../types/types';
import { KialiComponentFactory } from './factories/KialiComponentFactory';
import { KialiLayoutFactory } from './factories/KialiLayoutFactory';
import { decorateGraphData } from './util/GraphDecorator';
import { generateDataModel } from './util/GraphGenerator';

function TrafficGraphPage(props: { view: string }) {
  const kialiClient = useApi(kialiApiRef);
  const kialiState = React.useContext(KialiContext) as KialiAppState;
  const [duration, setDuration] = useState(FilterHelper.currentDuration());
  const [loadingData, setLoadingData] = useState(false);
  const visualizationRef = React.useRef<Visualization>();
  const activeNamespaces = kialiState.namespaces.activeNamespaces;

  if (!visualizationRef.current) {
    visualizationRef.current = new Visualization();
    visualizationRef.current.registerLayoutFactory(KialiLayoutFactory);
    visualizationRef.current.registerComponentFactory(KialiComponentFactory);
    visualizationRef.current.setFitToScreenOnLayout(true);
  }

  const controller = visualizationRef.current;

  const graphConfig = useMemo(
    () => ({
      id: 'g1',
      type: 'graph',
      layout: 'Dagre',
    }),
    [],
  );

  const graphQueryElements = useMemo(
    () => ({
      activeNamespaces: activeNamespaces.map(ns => ns.name).join(','),
      namespaces: activeNamespaces.map(ns => ns.name).join(','),
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
    }),
    [activeNamespaces],
  );

  useEffect(() => {
    const d = HistoryManager.getDuration();
    if (d !== undefined) {
      setDuration(60);
    } else {
      setDuration(FilterHelper.currentDuration());
    }
  }, []);

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

  const fetchGraph = useCallback(async () => {
    setLoadingData(true);
    if (activeNamespaces.length === 0) {
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

    try {
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
    } catch (error: any) {
      kialiState.alertUtils?.add(
        `Could not fetch services: ${getErrorString(error)}`,
      );
    } finally {
      setLoadingData(false);
    }
  }, [activeNamespaces, duration, kialiClient, kialiState]);

  useEffect(() => {
    fetchGraph();
  }, [duration, activeNamespaces, fetchGraph]);

  if (loadingData) {
    return <CircularProgress />;
  }

  return (
    <>
      {props.view !== ENTITY && (
        <DefaultSecondaryMasthead
          elements={[timeDuration]}
          onRefresh={fetchGraph}
        />
      )}
      <VisualizationProvider controller={controller}>
        <VisualizationSurface state={{ duration }} />
      </VisualizationProvider>
    </>
  );
}

export default TrafficGraphPage;
