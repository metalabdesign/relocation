import {Component, createElement, PropTypes} from 'react';
import hoistStatics from 'hoist-non-react-statics';
import {connect} from 'react-redux';

import {getMergedComponents} from './selector';
import {removeComponent} from './action';
import {componentsShape, renderMapShape, getDisplayName} from './util';

/**
 * Create a higher-order wrapper which provides an array of components to render
 * to its wrapped instance.
 *
 * @param {Object|Function} rawRenderMap An object with component type/render
 * function key value pairs or a function returning such an object.
 * @param {Object} defaultProps An object or a function returing such an
 * object.
 * @returns {Function} Higher-order component wrapper.
 */
export default ({scope, ...defaultProps} = {}) => (WrappedComponent) => {
  class Connect extends Component {
    static propTypes = {
      ___relocationDispatch___: {
        removeComponent: PropTypes.func.isRequired,
      },
      ___relocationState___: PropTypes.shape({
        components: componentsShape.isRequired,
        renderMap: renderMapShape.isRequired,
      }).isRequired,
    };

    static contextTypes = {
      router: PropTypes.object,
    }

    navigateToPath(path) {
      // Check for the react-router context.
      if (!this.context.router) {
        return;
      }

      this.context.router.push(path);
    }

    render() {
      const {components, renderMap} = this.props.___relocationState___;
      const {removeComponent} = this.props.___relocationDispatch___;

      const inRenderMap = (component) =>
        typeof renderMap[component.type] === 'function';

      const assignRender = (component) => ({
        ...component,
        render: renderMap[component.type],
      });

      const assignScope = (component) => ({...component, scope});

      const assignRemoveHandler = (component) => {
        let removeHandler = null;

        if (typeof component.remove === 'function') {
          // The component object remove property is already a function.
          // We don't want to override this behavior.
          removeHandler = component.remove;
        } else if (component.remove === undefined || component.remove) {
          // The component object does not have a `remove` property, or it has
          // a truthy value that is not a function. Either case indicates that
          // it should use the default remove handler.
          removeHandler = () => removeComponent(component.id);
        }

        let pathRemoveHandler = null;

        if (typeof component.removePath === 'string') {
          // Create a function that will change the history state when removing
          // the component.
          pathRemoveHandler = () => this.navigateToPath(component.removePath);
        }

        if (pathRemoveHandler && removeHandler) {
          // A remove handler function and a
          return {
            ...component,
            remove: () => {
              pathRemoveHandler();
              return removeHandler();
            },
          };
        }

        if (pathRemoveHandler && !removeHandler) {
          return {
            ...component,
            remove: pathRemoveHandler,
          };
        }

        if (!pathRemoveHandler && removeHandler !== component.remove) {
          return {
            ...component,
            remove: removeHandler,
          };
        }

        // `!pathRemoveHandler && removeHandler === component.remove` is true.
        // This means `remove` was set and `removePath` was not set on the
        // component object. No modification is necessary.
        return component;
      };

      const currentComponents = components
        // Remove components not included in the render function map.
        .filter(inRenderMap)
        // Assign render functions.
        .map(assignRender)
        // Assign scope, if configured.
        .map(scope ? assignScope : (component) => component)
        // Assign remove handler functions.
        .map(assignRemoveHandler);

      /* eslint-disable no-unused-vars */
      const {
        ___relocationState___,
        ___relocationDispatch___,
        ...childProps,
      } = this.props;
      /* eslint-enable no-unused-vars */

      const mergedProps = {
        ...childProps,
        ...scope
          ? {[scope]: {components: currentComponents}}
          : {components: currentComponents},
      };

      return <WrappedComponent {...mergedProps}/>;
    }
  }

  Connect.displayName = `Relocation(${getDisplayName(WrappedComponent)})`;

  const mapState = (state, props) => {
    const mergedProps = {
      ...defaultProps,
      ...scope ? props[scope] : props,
    };

    const {components, getRelocationState} = mergedProps;

    const selectorProps = getRelocationState
      ? {getRelocationState, ...props}
      : props;

    return {
      // Put everything in a ___relocationState___ namespace to avoid possible
      // conflict with existing props.
      ___relocationState___: {
        components: getMergedComponents(state, selectorProps),
        renderMap: components,
      },
    };
  };

  const mapDispatch = (dispatch) => ({
      // Put everything in a ___relocationDispatch___ namespace to avoid
      // possible conflict with existing props.
    ___relocationDispatch___: {
      removeComponent: (id) => dispatch(removeComponent(id)),
    },
  });

  return connect(
    mapState,
    mapDispatch,
  )(hoistStatics(Connect, WrappedComponent));
};