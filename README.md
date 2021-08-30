# Graph Editor Documentation

This documents how to perform different actions on the `Graph()` Python class used for developing our algorithms.

## Table of Contents

1. [Editor](#editor)
   - [Graph Class](#graph-class)
     - [Activate Node](#activate-node)
     - [Activate Edge](#activate-node)
     - [Get Neighbors of a Node](#get-neighbors-of-a-node)
     - [Get All Nodes](#get-all-nodes)
     - [Get All Edges](#get-all-edges)
2. [Graph](#graph)
   - [Creating Nodes](#creating-nodes)
   - [Creating Edges](#creating-edges)
   - [Deleting Nodes](#deleting-nodes)
   - [Deleting Edges](#deleting-edges)

## Editor

### Graph Class

#### Activate Node

##### `activateNode(id)`

Activating a node will turn its color to green. This can be used to track vistited nodes as you progress throughout your algorithm.

##### Usage

To activate the node with id "A" we would use the following command:

```
g = Graph()
g.activateNode("A")
```

Producing the following result in our graph:

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/activated-node.png?alt=media&token=030b3951-e8c6-4167-b2c2-87ad742248be">
</p>

#### Activate Edge

##### `activateEdge(source_id, target_id)`

Activating a edge will turn its color to green. This can be used to track vistited edges as you progress throughout your algorithm.

##### Usage

To activate the edge with a source node id of "A" and a target node id of "B" we would use the following command:

```
g = Graph()
g.activateEdge("A", "B")
```

Producing the following result in our graph:

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/activated-edge.png?alt=media&token=517238df-9d91-4a6c-a351-1a4724804d59">
</p>

#### Get Neighbors of a Node

##### `getNeighbors(id)`

Returns all neighbors for a node with `id`.

##### Usage

For the following graph and input:

```
g = Graph()
neighbors = g.getNeighbors("A")
print(neighbors)
```

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/get-neighbors.png?alt=media&token=083ab775-97fc-4387-8ca0-539c73c65676">
</p>
We get the following output:
```
{'C': {}, 'B': {}, 'D': {}}
```


#### Get All Nodes

##### `getNodes()`

Returns all nodes in the graph.

##### Usage

For the following graph and input:

```
g = Graph()
nodes = g.getNodes()
print(nodes)
```

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/get-neighbors.png?alt=media&token=083ab775-97fc-4387-8ca0-539c73c65676">
</p>

We get the following output:

```
[('A', {}), ('B', {}), ('C', {}), ('D', {})]
```

#### Get All Edges

##### `getEdges()`

Returns all edges in the graph.

##### Usage

For the following graph and input:

```
g = Graph()
edges = g.getEdges()
print(edges)
```

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/get-neighbors.png?alt=media&token=083ab775-97fc-4387-8ca0-539c73c65676">
</p>

We get the following output:

```
[('A', 'C', {}), ('A', 'B', {}), ('A', 'D', {}), ('B', 'C', {}), ('B', 'D', {})]
```

## Graph

### Creating Nodes

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/add-node.gif?alt=media&token=59161335-2fbd-4efb-9166-777f35913823">
</p>

To create a node hold down `SHIFT` and then click on an empty area of the graph as shown above.

### Creating Edges

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/add-edge.gif?alt=media&token=75ee3e94-896f-42e5-8387-fb2bd61e3914">
</p>

To create an edge between two nodes hold down `SHIFT` and drag from the source node to the target node as shown above.

### Deleting Nodes

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/delete-node.gif?alt=media&token=3da7d0b8-5ff7-4169-bf9d-0d14dea8e4af">
</p>

To delete nodes `CLICK` on the node you want to delete and press the `DELETE` the key. Edges connected to the deleted node will automatically be deleted as well.

### Deleting Edges

<p align="center">
  <img width="80%" height="100%" src="https://firebasestorage.googleapis.com/v0/b/graph-editor-7e4ef.appspot.com/o/delete-edge.gif?alt=media&token=0a94ca54-16d0-4e89-afeb-4cf42c30dc34">
</p>

To delete edges `CLICK` on the edge you want to delete and press the `DELETE` the key.
