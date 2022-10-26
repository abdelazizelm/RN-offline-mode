import {Text, View, TextInput, Button, ScrollView} from 'react-native';

import React, {useEffect, useState} from 'react';
import SyncStorage from 'sync-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import {
  useQuery,
  QueryClient,
  MutationCache,
  onlineManager,
  useIsRestoring,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {createAsyncStoragePersister} from '@tanstack/query-async-storage-persister';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      cacheTime: 1000 * 60 * 60 * 24, // 24 hours
      // staleTime: 2000,
      // retry: 0,
    },
  },
  // configure global cache callbacks to show toast notifications
  mutationCache: new MutationCache({
    onSuccess: data => {
      console.log('success', data);
    },
    onError: error => {
      console.log('error');
    },
  }),
});

onlineManager.setEventListener(setOnline => {
  return NetInfo.addEventListener(state => {
    setOnline(state.isConnected);
  });
});

export default function App() {
  useEffect(() => {
    AsyncStorage.getItem(`REACT_QUERY_OFFLINE_CACHE`).then(data =>
      console.log('react query offline cache: ', data),
    );
  }, []);
  // we need a default mutation function so that paused mutations can resume after a page reload
  queryClient.setMutationDefaults(['client'], {
    mutationFn: async newClient => {
      // to avoid clashes with our optimistic update when an offline mutation continues
      await queryClient.cancelQueries(['clients']);
      return PostClient(newClient);
    },
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{persister: persister}}
      onSuccess={() => {
        // resume mutations after initial restore from localStorage was successful
        queryClient.resumePausedMutations().then(() => {
          queryClient.invalidateQueries();
        });
      }}>
      <List />
    </PersistQueryClientProvider>
  );
}

const FetchClients = async () => {
  const clients = await fetch('http://192.168.1.108:8000/clients');
  return await clients.json();
};

const PostClient = newClient => {
  let reqOptions = {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(newClient),
  };

  fetch('http://192.168.1.108:8000/clients', reqOptions)
    .then(res => res.json())
    .then(client => {
      return client;
    })
    .catch(err => {
      // console.log('fetch failed', err);
    });
};

function List() {
  const [firstName, SetFirstName] = React.useState();
  const [lastName, SetLastName] = React.useState();
  const [client, setClient] = React.useState();

  React.useEffect(() => {
    setClient({firstName, lastName});
  }, [firstName, lastName]);

  const clientsQuery = useQuery(['clients'], FetchClients);

  function submitForm(event) {
    event.preventDefault();

    mutateClient.mutate(client);
    SetFirstName('');
    SetLastName('');
  }

  const mutateClient = useMutation({
    mutationKey: ['client'],
    onMutate: async () => {
      await queryClient.cancelQueries(['clients']);
      const previousData = queryClient.getQueryData(['clients']);

      // remove local state so that server state is taken instead
      setClient(undefined);

      queryClient.setQueryData(['clients'], {
        ...previousData,
        client: {
          ...previousData?.clients,
          client,
        },
      });

      //console.log(previousData);

      return {previousData};
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(['clients'], context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries();
    },
  });

  if (clientsQuery.isLoading && clientsQuery.isFetching) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <Text>fetching...</Text>
      </View>
    );
  }

  if (clientsQuery.data) {
    return (
      <View>
        <Text style={{fontSize: 18, fontWeight: 'bold', padding: 10}}>
          mock offline behaviour.
        </Text>
        <ScrollView style={{height: '30%', backgroundColor: '#ccc'}}>
          {clientsQuery.data?.clients?.map(el => (
            <Text key={el._id}>{el.firstName}</Text>
          ))}
        </ScrollView>
        <View>{clientsQuery.isFetching && <Text>fetching...</Text>}</View>
        <View
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-around',
          }}>
          <View
            style={{
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
            }}>
            <Text>First Name:</Text>
            <TextInput
              style={{
                width: 200,
                padding: 5,
                borderWidth: 1,
                borderColor: '#ccc',
              }}
              type="text"
              name="name"
              value={firstName}
              onChangeText={event => SetFirstName(event)}
            />
          </View>
          <View
            style={{
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
            }}>
            <Text>Last Name:</Text>
            <TextInput
              style={{
                width: 200,
                padding: 5,
                borderWidth: 1,
                borderColor: '#ccc',
              }}
              type="text"
              name="name"
              value={lastName}
              onChangeText={event => SetLastName(event)}
            />
          </View>
          <View style={{padding: 10}}>
            <Button
              type="submit"
              title="Submit"
              style={{width: 100, padding: 10}}
              onPress={submitForm}
            />
          </View>
        </View>
      </View>
    );
  }

  // query will be in 'idle' fetchStatus while restoring from localStorage
  return null;
}
