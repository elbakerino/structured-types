import { FunctionProp } from '@structured-types/api/types';
import { textNode } from '../blocks/text';
import { DocumentationNode } from '../types';
import { DocumentationConfig } from '../DocumentationConfig';
import { blockNode } from '../blocks/block';

export const functionPropNodes = (
  prop: FunctionProp,
  config: DocumentationConfig,
): DocumentationNode[] => {
  const result: DocumentationNode[] = [blockNode([textNode('function (')])];
  if (prop.parameters) {
    prop.parameters.forEach((p) => {
      result.push(...config.propTypes.extractNamedType(p));
    });
  }
  result.push(textNode(')'));
  if (prop.returns) {
    const propReturns = {
      name: 'returns',
      ...prop.returns,
    };
    result.push(textNode(' => '));
    result.push(...config.propTypes.extractType(propReturns));
  } else {
    result.push(textNode('=> void'));
  }
  return result;
};